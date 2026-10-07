import type { FastifyInstance } from "fastify";
import {
  ROW_POINTS,
  TALENTS,
  TALENT_KEYS,
  TALENT_TREES,
  type TalentKey,
  type Talents,
  isTalent,
  learnError,
  levelFromXp,
  resetCost,
  spentPoints,
  talentBonus,
  talentPoints,
  talentText,
} from "@tokenquest/shared";
import { requireCharacter } from "./characters.ts";
import type { Character, PrismaClient } from "./generated/prisma/client.ts";

function talentsView(character: Character) {
  const talents = character.talents as Talents;
  const level = levelFromXp(character.xp).level;
  return {
    points: talentPoints(level),
    spent: spentPoints(talents),
    resetCost: resetCost(talents),
    gold: character.gold,
    bonus: talentBonus(talents),
    trees: TALENT_TREES.map((tree) => ({ tree, spent: spentPoints(talents, tree) })),
    talents: TALENT_KEYS.map((key) => {
      const t = TALENTS[key];
      const rank = talents[key] ?? 0;
      const requires = "requires" in t ? (t.requires as TalentKey) : null;
      return {
        key,
        name: t.name,
        tree: t.tree,
        row: t.row,
        col: t.col,
        icon: t.icon,
        flavor: t.flavor,
        rank,
        max: t.max,
        rowPoints: ROW_POINTS[t.row],
        requires,
        current: talentText(key, rank),
        next: talentText(key, rank + 1),
        error: learnError(talents, key, level),
      };
    }),
  };
}

export function talentRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get("/talents", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    return talentsView(character);
  });

  app.post<{ Body: { key: string } }>(
    "/talents/learn",
    { schema: { body: { type: "object", required: ["key"], properties: { key: { type: "string" } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const { key } = req.body;
      if (!isTalent(key)) return reply.code(400).send({ error: "unknown talent" });
      const result = await db.$transaction(async (tx) => {
        // Locks the character, so parallel requests cannot spend the same point twice.
        await tx.$queryRaw`SELECT id FROM characters WHERE id = ${character.id} FOR UPDATE`;
        const fresh = await tx.character.findUniqueOrThrow({ where: { id: character.id } });
        const talents = fresh.talents as Talents;
        const error = learnError(talents, key, levelFromXp(fresh.xp).level);
        if (error) return { error };
        return tx.character.update({ where: { id: fresh.id }, data: { talents: { ...talents, [key]: (talents[key] ?? 0) + 1 } } });
      });
      if ("error" in result) return reply.code(400).send(result);
      return talentsView(result);
    },
  );

  app.post("/talents/reset", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const talents = character.talents as Talents;
    const cost = resetCost(talents);
    if (cost === 0) return reply.code(400).send({ error: "no talents to reset" });
    // Matching the talents read above keeps a point learned in between from being reset at the old price.
    const reset = await db.character.updateMany({
      where: { id: character.id, gold: { gte: cost }, talents: { equals: talents } },
      data: { talents: {}, gold: { decrement: cost } },
    });
    if (reset.count === 0) return reply.code(400).send({ error: `resetting costs ${cost} gold` });
    return talentsView(await db.character.findUniqueOrThrow({ where: { id: character.id } }));
  });
}
