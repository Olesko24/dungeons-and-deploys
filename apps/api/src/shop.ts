import type { FastifyInstance } from "fastify";
import { levelFromXp, shopDay, shopOffers } from "@dnd/shared";
import type { Deps } from "./app.ts";
import { BAG_FULL, bagFull, itemView, requireCharacter } from "./characters.ts";
import { Prisma } from "./generated/prisma/client.ts";

export function shopRoutes(app: FastifyInstance, { db, now }: Required<Deps>) {
  app.get("/shop", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const t = now();
    const day = shopDay(t);
    const bought = new Set(
      (await db.shopPurchase.findMany({ where: { characterId: character.id, day } })).map((p) => p.offer),
    );
    const level = levelFromXp(character.xp).level;
    const tomorrow = new Date(`${day}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000;
    return {
      gold: character.gold,
      refreshesAt: new Date(tomorrow),
      offers: shopOffers(day).map((o, i) => ({
        offer: i + 1,
        key: o.key,
        name: o.name,
        rarity: o.rarity,
        stats: o.stats,
        price: o.price,
        unlockLevel: o.unlockLevel,
        locked: level < o.unlockLevel,
        bought: bought.has(i + 1),
      })),
    };
  });

  app.post<{ Body: { offer: number } }>(
    "/shop/buy",
    { schema: { body: { type: "object", required: ["offer"], properties: { offer: { type: "integer", minimum: 1, maximum: 3 } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const day = shopDay(now());
      const offer = shopOffers(day)[req.body.offer - 1];
      if (levelFromXp(character.xp).level < offer.unlockLevel) {
        return reply.code(400).send({ error: `${offer.rarity} offers unlock at level ${offer.unlockLevel}` });
      }

      const result = await db
        .$transaction(async (tx) => {
          if (await bagFull(tx, character.id)) throw new Error(BAG_FULL);
          // The purchase row comes first: its primary key rejects a second purchase of the same offer today.
          await tx.shopPurchase.create({
            data: { characterId: character.id, day, offer: req.body.offer, itemKey: offer.key, price: offer.price },
          });
          const paid = await tx.character.updateMany({
            where: { id: character.id, gold: { gte: offer.price } },
            data: { gold: { decrement: offer.price } },
          });
          if (paid.count === 0) throw new Error("not enough gold");
          const bought = await tx.item.create({ data: { characterId: character.id, key: offer.key, ...offer.stats } });
          return { item: itemView(bought), price: offer.price };
        })
        .catch((err) => {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { error: "already bought today" };
          if (err instanceof Error && err.message === "not enough gold") return { error: `not enough gold, this costs ${offer.price}` };
          if (err instanceof Error && err.message === BAG_FULL) return { error: BAG_FULL };
          throw err;
        });
      if ("error" in result) return reply.code(400).send(result);
      return result;
    },
  );
}
