import type { FastifyInstance } from "fastify";
import { type Slot, equipPlan, equipmentBonus } from "@dnd/shared";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { itemView, requireCharacter } from "./characters.ts";

const SLOTS = ["head", "chest", "legs", "hands", "feet", "mainHand", "offHand", "ring1", "ring2", "neck", "ears"];

export function inventoryRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get("/inventory", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const items = await db.item.findMany({ where: { characterId: character.id }, orderBy: { id: "asc" } });
    return {
      items: items.map(itemView),
      bonus: equipmentBonus(items.filter((i) => i.equippedSlot)),
    };
  });

  app.post<{ Params: { id: string }; Body: { slot?: Slot } | undefined }>(
    "/inventory/:id/equip",
    { schema: { body: { type: ["object", "null"], properties: { slot: { type: "string", enum: SLOTS } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const target = await db.item.findFirst({ where: { id: Number(req.params.id), characterId: character.id, listedAt: null } });
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
