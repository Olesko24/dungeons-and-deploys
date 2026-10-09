import type { FastifyInstance } from "fastify";
import {
  ENCOUNTER_CHANCE,
  ENCOUNTER_MS,
  MONSTERS,
  type MonsterKey,
  type Talents,
  fightRewards,
  fightStory,
  levelFromXp,
  playerBonus,
  playerPower,
  recommendedPower,
  rollLoot,
  rollMonster,
  rollStats,
  talentBonus,
  winChance,
  withBonus,
} from "@dnd/shared";
import type { Deps } from "./app.ts";
import { equippedItems, giveLoot, itemView, requireCharacter } from "./characters.ts";
import { guildBuffs } from "./guilds.ts";
import type { Character, PrismaClient } from "./generated/prisma/client.ts";

const activeEncounter = (db: PrismaClient, characterId: number, t: Date) =>
  db.encounter.findFirst({ where: { characterId, foughtAt: null, expiresAt: { gt: t } } });

/** Called on every accepted heartbeat. Spawns at most one monster at a time. */
export async function maybeSpawnEncounter(db: PrismaClient, character: Character, t: Date, random: () => number) {
  const chance = ENCOUNTER_CHANCE * (1 + talentBonus(character.talents as Talents, await guildBuffs(db, character.id, t)).encounter / 100);
  if (random() >= chance || (await activeEncounter(db, character.id, t))) return;
  await db.encounter.create({
    data: {
      characterId: character.id,
      monster: rollMonster(random),
      level: levelFromXp(character.xp).level,
      expiresAt: new Date(t.getTime() + ENCOUNTER_MS),
    },
  });
}

/** The active encounter with the current odds, or null. */
export async function encounterView(db: PrismaClient, character: Character, t: Date) {
  const encounter = await activeEncounter(db, character.id, t);
  if (!encounter) return null;
  const bonus = playerBonus(await equippedItems(db, character.id), character.talents as Talents, await guildBuffs(db, character.id, t));
  const monster = encounter.monster as MonsterKey;
  const { level } = levelFromXp(character.xp);
  const percent = bonus.power + bonus.fightPower;
  return {
    key: monster,
    name: MONSTERS[monster].name,
    level: encounter.level,
    expiresAt: encounter.expiresAt,
    winChance: winChance(level, bonus.gear, monster, percent),
    power: playerPower(level, bonus.gear, percent),
    recommended: recommendedPower(level, MONSTERS[monster].power),
  };
}

export function encounterRoutes(app: FastifyInstance, { db, now, random }: Required<Deps>) {
  app.post("/fight", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const t = now();

    const result = await db.$transaction(async (tx) => {
      const encounter = await tx.encounter.findFirst({
        where: { characterId: character.id, foughtAt: null, expiresAt: { gt: t } },
      });
      if (!encounter) return null;
      const monster = encounter.monster as MonsterKey;
      const level = levelFromXp(character.xp).level;
      const bonus = playerBonus(await equippedItems(tx, character.id), character.talents as Talents, await guildBuffs(tx, character.id, t));
      const chance = winChance(level, bonus.gear, monster, bonus.power + bonus.fightPower);
      const won = random() < chance;
      const rewards = won ? fightRewards(monster, level, bonus.gear.fortune + bonus.fightGold) : { xp: bonus.failXp, gold: 0 };
      rewards.xp = withBonus(rewards.xp, bonus.xp + bonus.fightXp);
      const lootKey = won ? rollLoot(level, 1, random, bonus) : null;

      // Marking the encounter fought first makes a second parallel fight a no-op.
      const marked = await tx.encounter.updateMany({
        where: { id: encounter.id, foughtAt: null },
        data: { foughtAt: t, won, ...rewards },
      });
      if (marked.count === 0) return null;
      await tx.character.update({
        where: { id: character.id },
        data: { xp: { increment: rewards.xp }, gold: { increment: rewards.gold } },
      });
      const loot = lootKey
        ? await giveLoot(tx, character.id, lootKey, rollStats(lootKey, random))
        : null;
      if (loot) await tx.encounter.update({ where: { id: encounter.id }, data: { lootItemId: loot.id } });
      return { key: monster, monster: MONSTERS[monster].name, level: encounter.level, winChance: chance, won, story: fightStory(monster, won), ...rewards, loot: loot && itemView(loot) };
    });

    if (!result) return reply.code(404).send({ error: "no monster around" });
    return result;
  });
}
