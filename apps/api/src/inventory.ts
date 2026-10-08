import type { FastifyInstance } from "fastify";
import {
  BAG_LIMIT,
  RARITIES,
  type Rarity,
  type Slot,
  UPGRADE_COST,
  equipPlan,
  equipmentBonus,
  item,
  randomItemOf,
  rarityIndex,
  rollStats,
  scrapValue,
} from "@dnd/shared";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { BAG_FULL, itemCount, itemView, requireCharacter } from "./characters.ts";

const SLOTS = ["head", "chest", "legs", "hands", "feet", "mainHand", "offHand", "ring1", "ring2", "neck", "ears"];

export function inventoryRoutes(app: FastifyInstance, db: PrismaClient, random: () => number) {
  app.get("/inventory", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const [items, shards] = await Promise.all([
      db.item.findMany({ where: { characterId: character.id, scrappedAt: null }, orderBy: { id: "asc" } }),
      db.shard.findMany({ where: { characterId: character.id, count: { gt: 0 } } }),
    ]);
    return {
      items: items.map(itemView),
      bonus: equipmentBonus(items.filter((i) => i.equippedSlot)),
      limit: BAG_LIMIT,
      shards: Object.fromEntries(shards.map((s) => [s.rarity, s.count])),
    };
  });

  app.post<{ Params: { id: string }; Body: { slot?: Slot } | undefined }>(
    "/inventory/:id/equip",
    { schema: { body: { type: ["object", "null"], properties: { slot: { type: "string", enum: SLOTS } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const target = await db.item.findFirst({ where: { id: Number(req.params.id), characterId: character.id, listedAt: null, scrappedAt: null } });
      if (!target) return reply.code(404).send({ error: "item not found" });

      const equipped = await db.item.findMany({
        where: { characterId: character.id, equippedSlot: { not: null }, id: { not: target.id } },
      });
      const plan = equipPlan(
        equipped.map((e) => ({ id: e.id, key: e.key, slot: e.equippedSlot as Slot })),
        target.key,
        req.body?.slot,
      );
      // Ownership and listing are checked again inside the transaction: the item may have been listed and drawn meanwhile.
      const equippedNow = await db.$transaction(async (tx) => {
        await tx.item.updateMany({
          where: { id: { in: [...plan.unequip, target.id] }, characterId: character.id },
          data: { equippedSlot: null },
        });
        const { count } = await tx.item.updateMany({
          where: { id: target.id, characterId: character.id, listedAt: null },
          data: { equippedSlot: plan.slot },
        });
        if (count === 0) throw new Error("item changed hands");
        return true;
      }).catch(() => false);
      if (!equippedNow) return reply.code(404).send({ error: "item not found" });
      return { slot: plan.slot, unequipped: plan.unequip };
    },
  );

  /** Destroys a bag item for a quarter of its value. */
  app.post<{ Params: { id: string } }>("/inventory/:id/scrap", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const gold = await db.$transaction(async (tx) => {
      const target = await tx.item.findFirst({ where: { id: Number(req.params.id) || 0, characterId: character.id, equippedSlot: null, listedAt: null, scrappedAt: null } });
      if (!target) return null;
      const scrapped = await tx.item.updateMany({ where: { id: target.id, equippedSlot: null, listedAt: null, scrappedAt: null }, data: { scrappedAt: new Date() } });
      if (scrapped.count === 0) return null;
      const gold = scrapValue(target.key, target);
      await tx.character.update({ where: { id: character.id }, data: { gold: { increment: gold } } });
      return gold;
    });
    if (gold === null) return reply.code(400).send({ error: "item not found, equipped or listed" });
    return { gold };
  });

  /** Fuses UPGRADE_COST bag items of one rarity into a random item of the next rarity. */
  app.post<{ Body: { ids: number[] } }>(
    "/inventory/upgrade",
    {
      schema: {
        body: {
          type: "object",
          required: ["ids"],
          properties: { ids: { type: "array", items: { type: "integer" }, minItems: UPGRADE_COST, maxItems: UPGRADE_COST, uniqueItems: true } },
        },
      },
    },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const free = { id: { in: req.body.ids }, characterId: character.id, equippedSlot: null, listedAt: null, scrappedAt: null };
      const result = await db.$transaction(async (tx) => {
        const items = await tx.item.findMany({ where: free });
        if (items.length !== UPGRADE_COST) return `pick ${UPGRADE_COST} bag items that are not equipped or listed`;
        const { rarity } = item(items[0].key);
        if (items.some((i) => item(i.key).rarity !== rarity)) return "the items must have the same rarity";
        const next = RARITIES[rarityIndex(rarity) + 1];
        if (!next) return `${rarity} is the highest rarity`;
        const used = await tx.item.updateMany({ where: free, data: { scrappedAt: new Date() } });
        if (used.count !== UPGRADE_COST) throw new Error("items changed");
        const key = randomItemOf(next, random);
        return tx.item.create({ data: { characterId: character.id, key, ...rollStats(key, random) } });
      }).catch(() => "the items changed meanwhile, try again");
      if (typeof result === "string") return reply.code(400).send({ error: result });
      return { item: itemView(result) };
    },
  );

  /** Turns one shard into a random item of its rarity. */
  app.post<{ Params: { rarity: string } }>("/inventory/shards/:rarity/forge", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const rarity = req.params.rarity as Rarity;
    if (!RARITIES.includes(rarity)) return reply.code(404).send({ error: "unknown rarity" });
    if ((await itemCount(db, character.id)) >= BAG_LIMIT) return reply.code(400).send({ error: BAG_FULL });
    const forged = await db.$transaction(async (tx) => {
      const used = await tx.shard.updateMany({ where: { characterId: character.id, rarity, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
      if (used.count === 0) return null;
      const key = randomItemOf(rarity, random);
      return tx.item.create({ data: { characterId: character.id, key, ...rollStats(key, random) } });
    });
    if (!forged) return reply.code(400).send({ error: `you have no ${rarity} shard` });
    return { item: itemView(forged) };
  });

  app.post<{ Params: { id: string } }>("/inventory/:id/unequip", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const updated = await db.item.updateMany({
      where: { id: Number(req.params.id), characterId: character.id },
      data: { equippedSlot: null },
    });
    if (updated.count === 0) return reply.code(404).send({ error: "item not found" });
    return reply.code(204).send();
  });
}
