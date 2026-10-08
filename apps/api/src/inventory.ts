import type { FastifyInstance } from "fastify";
import { BAG_LIMIT, type Slot, equipPlan, equipmentBonus, scrapValue } from "@dnd/shared";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { itemView, requireCharacter } from "./characters.ts";

const SLOTS = ["head", "chest", "legs", "hands", "feet", "mainHand", "offHand", "ring1", "ring2", "neck", "ears"];

export function inventoryRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get("/inventory", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const items = await db.item.findMany({ where: { characterId: character.id, scrappedAt: null }, orderBy: { id: "asc" } });
    return {
      items: items.map(itemView),
      bonus: equipmentBonus(items.filter((i) => i.equippedSlot)),
      limit: BAG_LIMIT,
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
