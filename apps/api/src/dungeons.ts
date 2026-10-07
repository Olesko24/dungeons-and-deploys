import type { FastifyInstance } from "fastify";
import {
  DUNGEON_LOBBY_MS,
  DUNGEON_MAX_PARTY,
  DUNGEON_SLOTS_PER_STAGE,
  DUNGEON_STAGES,
  DUNGEON_STAGE_MS,
  SLOT_MS,
  bossLoot,
  countSlots,
  equipmentBonus,
  levelFromXp,
  rollStats,
  stageChance,
  stageRewards,
} from "@tokenquest/shared";
import type { Deps } from "./app.ts";
import { randomCode } from "./auth.ts";
import { requireCharacter } from "./characters.ts";
import type { Character, PrismaClient } from "./generated/prisma/client.ts";

const STAGES = DUNGEON_STAGES.length;
const RUN_MS = STAGES * DUNGEON_STAGE_MS;

export const stageEndsAt = (startsAt: Date, stage: number) => new Date(startsAt.getTime() + (stage + 1) * DUNGEON_STAGE_MS);

const activeMembership = (db: PrismaClient, characterId: number) =>
  db.dungeonMember.findFirst({ where: { characterId, dungeon: { endedAt: null } }, include: { dungeon: true } });

export async function dungeonView(db: PrismaClient, characterId: number, t: Date, onlyActive = true) {
  const membership = await db.dungeonMember.findFirst({
    where: { characterId, ...(onlyActive ? { dungeon: { endedAt: null } } : {}) },
    orderBy: { joinedAt: "desc" },
    include: { dungeon: { include: { members: { include: { character: true } } } } },
  });
  if (!membership) return null;
  const d = membership.dungeon;
  const state = d.endedAt ? (d.success ? "won" : "failed") : t < d.startsAt ? "lobby" : "running";
  return {
    code: d.code,
    state,
    startsAt: d.startsAt,
    cleared: d.stage,
    stages: DUNGEON_STAGES.map((s) => s.name),
    current: state === "running" ? DUNGEON_STAGES[d.stage].name : null,
    stageEndsAt: state === "running" ? stageEndsAt(d.startsAt, d.stage) : null,
    members: d.members.map((m) => m.character.name),
    you: { xp: membership.xp, gold: membership.gold },
  };
}

/** Called on every accepted heartbeat: marks presence in the current 5-minute slot of a running dungeon. */
export async function dungeonHeartbeat(db: PrismaClient, character: Character, t: Date) {
  const membership = await activeMembership(db, character.id);
  if (!membership) return;
  const elapsed = t.getTime() - membership.dungeon.startsAt.getTime();
  if (elapsed < 0 || elapsed >= RUN_MS) return;
  const bit = 1 << Math.floor(elapsed / SLOT_MS);
  await db.$executeRaw`UPDATE dungeon_members SET slots = slots | ${bit} WHERE dungeon_id = ${membership.dungeonId} AND character_id = ${character.id}`;
}

/** Resolves one stage. Returns whether the run goes on. Safe to run twice: a resolved stage changes nothing. */
export function resolveStage(db: PrismaClient, dungeonId: number, stage: number, random = Math.random, t = new Date()) {
  return db.$transaction(async (tx) => {
    const dungeon = await tx.dungeon.findUnique({
      where: { id: dungeonId },
      include: { members: { include: { character: { include: { items: { where: { equippedSlot: { not: null } } } } } } } },
    });
    if (!dungeon || dungeon.endedAt || dungeon.stage !== stage) return null;

    const members = dungeon.members.map((m) => {
      const stageBits = (m.slots >> (stage * DUNGEON_SLOTS_PER_STAGE)) & ((1 << DUNGEON_SLOTS_PER_STAGE) - 1);
      return { m, level: levelFromXp(m.character.xp).level, gear: equipmentBonus(m.character.items), presentSlots: countSlots(stageBits) };
    });
    const chance = stageChance(stage, members);
    const cleared = random() < chance;
    const last = stage === STAGES - 1;

    const advanced = await tx.dungeon.updateMany({
      where: { id: dungeonId, stage, endedAt: null },
      data: cleared ? { stage: stage + 1, ...(last ? { endedAt: t, success: true } : {}) } : { endedAt: t, success: false },
    });
    if (advanced.count === 0) return null;

    if (cleared) {
      for (const { m, level, gear } of members) {
        const reward = stageRewards(stage, level, members.length, gear.fortune);
        await tx.character.update({ where: { id: m.characterId }, data: { xp: { increment: reward.xp }, gold: { increment: reward.gold } } });
        let lootItemId: number | undefined;
        if (last) {
          const key = bossLoot(level, members.length, random);
          lootItemId = (await tx.item.create({ data: { characterId: m.characterId, key, ...rollStats(key, random) } })).id;
        }
        await tx.dungeonMember.update({
          where: { dungeonId_characterId: { dungeonId, characterId: m.characterId } },
          data: { xp: { increment: reward.xp }, gold: { increment: reward.gold }, lootItemId },
        });
      }
    }
    return { cleared, chance, next: cleared && !last };
  });
}

export function dungeonRoutes(app: FastifyInstance, { db, now, scheduleStage }: Required<Deps>) {
  app.post("/dungeons", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    if (await activeMembership(db, character.id)) return reply.code(409).send({ error: "already in a dungeon" });
    const startsAt = new Date(now().getTime() + DUNGEON_LOBBY_MS);
    const dungeon = await db.dungeon.create({
      data: { code: randomCode(6), startsAt, members: { create: { characterId: character.id } } },
    });
    await scheduleStage(dungeon.id, 0, stageEndsAt(startsAt, 0));
    return reply.code(201).send(await dungeonView(db, character.id, now()));
  });

  app.post<{ Body: { code: string } }>(
    "/dungeons/join",
    { schema: { body: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      if (await activeMembership(db, character.id)) return reply.code(409).send({ error: "already in a dungeon" });
      const dungeon = await db.dungeon.findUnique({
        where: { code: req.body.code.trim().toUpperCase() },
        include: { _count: { select: { members: true } } },
      });
      if (!dungeon || dungeon.endedAt || now() >= dungeon.startsAt) return reply.code(400).send({ error: "no open dungeon with that code" });
      if (dungeon._count.members >= DUNGEON_MAX_PARTY) return reply.code(400).send({ error: "party is full" });
      await db.dungeonMember.create({ data: { dungeonId: dungeon.id, characterId: character.id } });
      return dungeonView(db, character.id, now());
    },
  );

  app.get("/dungeons/current", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    return { dungeon: await dungeonView(db, character.id, now(), false) };
  });
}
