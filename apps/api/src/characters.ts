import type { FastifyReply, FastifyRequest } from "fastify";
import { item, itemName } from "@tokenquest/shared";
import { requireUser } from "./auth.ts";
import type { Item, PrismaClient } from "./generated/prisma/client.ts";

export async function requireCharacter(db: PrismaClient, req: FastifyRequest, reply: FastifyReply) {
  const user = await requireUser(db, req);
  if (!user) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  return db.character.findUniqueOrThrow({ where: { userId: user.id } });
}

export const itemView = (i: Item) => ({
  id: i.id,
  key: i.key,
  name: itemName(i.key, i),
  type: item(i.key).type,
  rarity: i.key.split(".")[1],
  stats: { attack: i.attack, defense: i.defense, luck: i.luck, fortune: i.fortune },
  equippedSlot: i.equippedSlot,
  listed: !!i.listedAt,
});

export const equippedItems = (db: Pick<PrismaClient, "item">, characterId: number) =>
  db.item.findMany({ where: { characterId, equippedSlot: { not: null } } });
