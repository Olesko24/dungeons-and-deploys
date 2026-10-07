import type { FastifyInstance } from "fastify";
import {
  RAID_BOSSES,
  RAID_MIN_PLAYERS,
  RAID_TICKS,
  RAID_TICK_MS,
  type Talents,
  combatPower,
  equipmentBonus,
  levelFromXp,
  playerPower,
  raidBossHp,
  raidDamage,
  raidLoot,
  raidPhase,
  raidRewards,
  raidStory,
  rollStats,
  talentBonus,
  withBonus,
} from "@dnd/shared";
import type { Deps } from "./app.ts";
import { equippedItems, requireCharacter } from "./characters.ts";
import { guildBuffs } from "./guilds.ts";
import type { Character, PrismaClient } from "./generated/prisma/client.ts";

/** Talents and buffs in raids, as one percent: combat power and raid damage multiply. */
const raidPercent = (b: { power: number; groupPower: number; raidDamage: number }) =>
  ((1 + (b.power + b.groupPower) / 100) * (1 + b.raidDamage / 100) - 1) * 100;

/** Your shown raid power. It compares directly with a boss's recommended power. */
async function raidPower(db: PrismaClient, character: Character, t: Date) {
  const items = await equippedItems(db, character.id);
  const bonus = talentBonus(character.talents as Talents, await guildBuffs(db, character.id, t));
  return playerPower(levelFromXp(character.xp).level, equipmentBonus(items), raidPercent(bonus));
}

export const raidTickAt = (startsAt: Date, tick: number) => new Date(startsAt.getTime() + tick * RAID_TICK_MS);

const openRaid = (db: PrismaClient, guildId: number) =>
  db.raid.findFirst({ where: { guildId, state: { in: ["scheduled", "running"] } } });

async function raidView(db: PrismaClient, guildId: number) {
  const raid = await db.raid.findFirst({
    where: { guildId },
    orderBy: { startsAt: "desc" },
    include: { members: { include: { character: true }, orderBy: { damage: "desc" } } },
  });
  if (!raid) return null;
  const boss = RAID_BOSSES[raid.tier];
  return {
    boss: boss.name,
    tier: raid.tier,
    recommended: boss.power,
    state: raid.state,
    story: raidStory(raid.id, raid.state, raid.tick, boss.name),
    startsAt: raid.startsAt,
    endsAt: raidTickAt(raid.startsAt, RAID_TICKS),
    tick: raid.tick,
    ticks: RAID_TICKS,
    bossHp: raid.bossHp,
    bossMaxHp: raid.bossMaxHp,
    minPlayers: RAID_MIN_PLAYERS,
    members: raid.members.map((m) => ({ name: m.character.name, damage: m.damage })),
  };
}

/**
 * Tick 0 starts the raid or cancels it below the minimum. Ticks 1-6 roll a boss phase and apply every raider's
 * damage. Returns whether another tick follows. Safe to run twice.
 */
export function advanceRaid(db: PrismaClient, raidId: number, tick: number, random = Math.random) {
  return db.$transaction(async (tx) => {
    const raid = await tx.raid.findUnique({
      where: { id: raidId },
      include: { members: { include: { character: { include: { items: { where: { equippedSlot: { not: null } } } } } } } },
    });
    const expected = tick === 0 ? "scheduled" : "running";
    if (!raid || raid.state !== expected || (tick > 0 && raid.tick !== tick - 1)) return null;

    const fighters = [];
    for (const m of raid.members) {
      const level = levelFromXp(m.character.xp).level;
      const bonus = talentBonus(m.character.talents as Talents, await guildBuffs(tx, m.characterId, new Date()));
      const power = combatPower(level, equipmentBonus(m.character.items)) * (1 + raidPercent(bonus) / 100);
      fighters.push({ m, level, bonus, power });
    }

    if (tick === 0) {
      if (fighters.length < RAID_MIN_PLAYERS) {
        await tx.raid.update({ where: { id: raidId }, data: { state: "cancelled" } });
        return { state: "cancelled", next: false };
      }
      const hp = raidBossHp(raid.tier, fighters.length);
      await tx.raid.update({ where: { id: raidId }, data: { state: "running", bossHp: hp, bossMaxHp: hp } });
      return { state: "running", next: true };
    }

    let total = 0;
    const phase = raidPhase(random);
    for (const f of fighters) {
      const hit = raidDamage(f.power, phase, random);
      total += hit;
      await tx.raidMember.update({
        where: { raidId_characterId: { raidId, characterId: f.m.characterId } },
        data: { damage: { increment: hit } },
      });
    }
    const hp = Math.max(0, raid.bossHp - total);
    const state = hp === 0 ? "won" : tick === RAID_TICKS ? "failed" : "running";
    await tx.raid.update({ where: { id: raidId }, data: { bossHp: hp, tick, state } });

    if (state === "won") {
      const damage = new Map((await tx.raidMember.findMany({ where: { raidId } })).map((m) => [m.characterId, m.damage]));
      let guildXp = 0;
      for (const f of fighters) {
        if (!damage.get(f.m.characterId)) continue;
        const raw = raidRewards(f.level, raid.tier);
        const reward = { xp: withBonus(raw.xp, f.bonus.xp + f.bonus.raidRewards), gold: withBonus(raw.gold, f.bonus.raidRewards) };
        guildXp += reward.xp;
        await tx.character.update({ where: { id: f.m.characterId }, data: { xp: { increment: reward.xp }, gold: { increment: reward.gold } } });
        const key = raidLoot(f.level, raid.tier, random);
        const loot = await tx.item.create({ data: { characterId: f.m.characterId, key, ...rollStats(key, random) } });
        await tx.raidMember.update({ where: { raidId_characterId: { raidId, characterId: f.m.characterId } }, data: { lootItemId: loot.id } });
      }
      const guild = await tx.guild.findUniqueOrThrow({ where: { id: raid.guildId } });
      // Beating the strongest unlocked boss unlocks the next one.
      const raidTier = Math.min(Math.max(guild.raidTier, raid.tier + 1), RAID_BOSSES.length - 1);
      await tx.guild.update({ where: { id: raid.guildId }, data: { xp: { increment: guildXp }, raidTier } });
    }
    return { state, next: state === "running" };
  });
}

export function raidRoutes(app: FastifyInstance, { db, now, scheduleRaid }: Required<Deps>) {
  const guildOf = (characterId: number) => db.guildMember.findUnique({ where: { characterId } });

  app.get("/raids/current", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const membership = await guildOf(character.id);
    if (!membership) return { raid: null, bosses: [], power: 0 };
    const guild = await db.guild.findUniqueOrThrow({ where: { id: membership.guildId } });
    return {
      raid: await raidView(db, membership.guildId),
      bosses: RAID_BOSSES.map((b, tier) => ({ tier, name: b.name, flavor: b.flavor, recommended: b.power, unlocked: tier <= guild.raidTier })),
      power: await raidPower(db, character, now()),
    };
  });

  app.post<{ Body: { startsInMinutes: number; tier?: number } }>(
    "/raids",
    {
      schema: {
        body: {
          type: "object",
          required: ["startsInMinutes"],
          properties: { startsInMinutes: { type: "integer", minimum: 5, maximum: 1440 }, tier: { type: "integer", minimum: 0 } },
        },
      },
    },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const membership = await guildOf(character.id);
      if (membership?.role !== "leader") return reply.code(403).send({ error: "only a guild leader can schedule raids" });
      if (await openRaid(db, membership.guildId)) return reply.code(409).send({ error: "your guild already has a raid planned" });
      // Without a choice the guild raids the strongest boss it has unlocked.
      const { raidTier } = await db.guild.findUniqueOrThrow({ where: { id: membership.guildId } });
      const tier = req.body.tier ?? raidTier;
      if (tier > raidTier) return reply.code(400).send({ error: `beat ${RAID_BOSSES[raidTier].name} first` });
      const startsAt = new Date(now().getTime() + req.body.startsInMinutes * 60_000);
      const raid = await db.raid.create({
        data: { guildId: membership.guildId, tier, startsAt, members: { create: { characterId: character.id } } },
      });
      await scheduleRaid(raid.id, 0, startsAt).catch(async (err) => {
        await db.raid.delete({ where: { id: raid.id } });
        throw err;
      });
      return reply.code(201).send({ raid: await raidView(db, membership.guildId) });
    },
  );

  app.post("/raids/join", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const membership = await guildOf(character.id);
    if (!membership) return reply.code(400).send({ error: "raids need a guild" });
    const raid = await openRaid(db, membership.guildId);
    if (!raid || raid.state !== "scheduled" || now() >= raid.startsAt) return reply.code(400).send({ error: "no raid open to join" });
    await db.raidMember.upsert({
      where: { raidId_characterId: { raidId: raid.id, characterId: character.id } },
      create: { raidId: raid.id, characterId: character.id },
      update: {},
    });
    return { raid: await raidView(db, membership.guildId) };
  });
}
