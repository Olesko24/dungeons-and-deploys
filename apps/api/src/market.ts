import type { FastifyInstance } from "fastify";
import {
  MARKET_DAILY_DRAWS,
  MARKET_PRICES,
  MARKET_UNLOCK_LEVEL,
  RARITIES,
  type Rarity,
  levelFromXp,
  sellerPayout,
} from "@dnd/shared";
import type { Deps } from "./app.ts";
import { itemView, requireCharacter } from "./characters.ts";
import { trySyncAchievements } from "./stats.ts";
import type { Prisma } from "./generated/prisma/client.ts";

const startOfDay = (t: Date) => new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));

const listedOfRarity = (rarity: Rarity, buyerId: number): Prisma.ItemWhereInput => ({
  listedAt: { not: null },
  key: { endsWith: `.${rarity}` },
  characterId: { not: buyerId },
});

export function marketRoutes(app: FastifyInstance, { db, now, random }: Required<Deps>) {
  app.get("/market", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const level = levelFromXp(character.xp).level;
    const drawsToday = await db.marketDraw.count({ where: { buyerId: character.id, createdAt: { gte: startOfDay(now()) } } });
    const offers = await Promise.all(
      RARITIES.map(async (rarity) => ({
        rarity,
        price: MARKET_PRICES[rarity],
        available: await db.item.count({ where: listedOfRarity(rarity, character.id) }),
        unlockLevel: MARKET_UNLOCK_LEVEL[rarity],
        unlocked: level >= MARKET_UNLOCK_LEVEL[rarity],
      })),
    );
    return { offers, drawsLeft: Math.max(0, MARKET_DAILY_DRAWS - drawsToday), gold: character.gold };
  });

  app.post<{ Params: { id: string } }>("/market/list/:id", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const listed = await db.item.updateMany({
      where: { id: Number(req.params.id), characterId: character.id, equippedSlot: null, listedAt: null },
      data: { listedAt: now() },
    });
    if (listed.count === 0) return reply.code(400).send({ error: "item not found, equipped or already listed" });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/market/unlist/:id", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const unlisted = await db.item.updateMany({
      where: { id: Number(req.params.id), characterId: character.id, listedAt: { not: null } },
      data: { listedAt: null },
    });
    if (unlisted.count === 0) return reply.code(400).send({ error: "item not listed" });
    return reply.code(204).send();
  });

  app.post<{ Body: { rarity: Rarity } }>(
    "/market/draw",
    { schema: { body: { type: "object", required: ["rarity"], properties: { rarity: { type: "string", enum: [...RARITIES] } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const { rarity } = req.body;
      const price = MARKET_PRICES[rarity];
      const t = now();

      const result = await db.$transaction(async (tx) => {
        if (levelFromXp(character.xp).level < MARKET_UNLOCK_LEVEL[rarity]) {
          return { error: `${rarity} draws unlock at level ${MARKET_UNLOCK_LEVEL[rarity]}` };
        }
        const drawsToday = await tx.marketDraw.count({ where: { buyerId: character.id, createdAt: { gte: startOfDay(t) } } });
        if (drawsToday >= MARKET_DAILY_DRAWS) return { error: "daily draw used, come back tomorrow" };

        const where = listedOfRarity(rarity, character.id);
        const available = await tx.item.count({ where });
        if (available === 0) return { error: `no ${rarity} items on the market` };
        const pick = await tx.item.findFirstOrThrow({ where, orderBy: { id: "asc" }, skip: Math.floor(random() * available) });

        const paid = await tx.character.updateMany({ where: { id: character.id, gold: { gte: price } }, data: { gold: { decrement: price } } });
        if (paid.count === 0) return { error: `not enough gold, a ${rarity} draw costs ${price}` };
        const moved = await tx.item.updateMany({
          where: { id: pick.id, listedAt: { not: null } },
          data: { characterId: character.id, listedAt: null },
        });
        if (moved.count === 0) throw new Error("listing taken by a parallel draw");
        await tx.character.update({ where: { id: pick.characterId }, data: { gold: { increment: sellerPayout(rarity) } } });
        await tx.marketDraw.create({ data: { buyerId: character.id, sellerId: pick.characterId, itemId: pick.id, rarity, price, createdAt: t } });
        return { item: itemView({ ...pick, characterId: character.id, listedAt: null }), price, sellerId: pick.characterId };
      });

      if ("error" in result) return reply.code(400).send(result);
      await trySyncAchievements(db, result.sellerId);
      return { item: result.item, price: result.price };
    },
  );
}
