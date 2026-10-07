import type { FastifyInstance } from "fastify";
import {
  ENCOUNTER_CHANCE,
  ENCOUNTER_MS,
  MONSTERS,
  type MonsterKey,
  equipmentBonus,
  fightRewards,
  fightStory,
  levelFromXp,
  rollLoot,
  rollMonster,
  rollStats,
  winChance,
} from "@tokenquest/shared";
import type { Deps } from "./app.ts";
import { equippedItems, itemView, requireCharacter } from "./characters.ts";
import type { Character, PrismaClient } from "./generated/prisma/client.ts";

const activeEncounter = (db: PrismaClient, characterId: number, t: Date) =>
  db.encounter.findFirst({ where: { characterId, foughtAt: null, expiresAt: { gt: t } } });

/** Called on every accepted heartbeat. Spawns at most one monster at a time. */
export async function maybeSpawnEncounter(db: PrismaClient, character: Character, t: Date, random: () => number) {
  if (random() >= ENCOUNTER_CHANCE || (await activeEncounter(db, character.id, t))) return;
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
  const gear = equipmentBonus(await equippedItems(db, character.id));
  const monster = encounter.monster as MonsterKey;
  return {
    name: MONSTERS[monster].name,
    level: encounter.level,
    expiresAt: encounter.expiresAt,
    winChance: winChance(levelFromXp(character.xp).level, gear, monster),
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
      const gear = equipmentBonus(await equippedItems(tx, character.id));
      const chance = winChance(level, gear, monster);
      const won = random() < chance;
      const rewards = won ? fightRewards(monster, level, gear.fortune) : { xp: 0, gold: 0 };
      const lootKey = won ? rollLoot(level, 1, random) : null;

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
        ? await tx.item.create({ data: { characterId: character.id, key: lootKey, ...rollStats(lootKey, random) } })
        : null;
      if (loot) await tx.encounter.update({ where: { id: encounter.id }, data: { lootItemId: loot.id } });
      return { monster: MONSTERS[monster].name, level: encounter.level, winChance: chance, won, story: fightStory(monster, won), ...rewards, loot: loot && itemView(loot) };
    });

    if (!result) return reply.code(404).send({ error: "no monster around" });
    return result;
  });
}
