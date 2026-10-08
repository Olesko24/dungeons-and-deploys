import type { FastifyReply, FastifyRequest } from "fastify";
import { BAG_LIMIT, SHARD_CHANCE, type Stats, item, itemName, marketValue, scrapValue } from "@dnd/shared";
import { requireUser } from "./auth.ts";
import type { Item, Prisma, PrismaClient } from "./generated/prisma/client.ts";

declare module "fastify" {
  interface FastifyRequest {
    /** Set once a route resolved the player, used to check achievements after the response. */
    characterId?: number;
  }
}

export async function requireCharacter(db: PrismaClient, req: FastifyRequest, reply: FastifyReply) {
  const user = await requireUser(db, req);
  if (!user) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  const character = await db.character.findUniqueOrThrow({ where: { userId: user.id } });
  req.characterId = character.id;
  return character;
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
  /** The listing price while on the market. */
  price: i.price,
  /** Suggested market price for this roll. */
  value: marketValue(i.key, i),
  /** Gold for scrapping it. */
  scrap: scrapValue(i.key, i),
  /** Scrapped right away because the bag was full. */
  scrapped: !!i.scrappedAt,
});

/** Items that count against the bag limit: everything not scrapped. */
const itemCount = (db: Pick<PrismaClient, "item">, characterId: number) => db.item.count({ where: { characterId, scrappedAt: null } });

export const BAG_FULL = `your bag is full (${BAG_LIMIT} items), scrap something first`;

/** Locks the character row first, so concurrent loot and purchases cannot both take the last free slot. */
export async function bagFull(tx: Prisma.TransactionClient, characterId: number) {
  await tx.$queryRaw`SELECT id FROM characters WHERE id = ${characterId} FOR UPDATE`;
  return (await itemCount(tx, characterId)) >= BAG_LIMIT;
}

/** Creates loot for a character. With a full bag it is scrapped at once and paid out in gold, so nothing is lost. */
export async function giveLoot(tx: Prisma.TransactionClient, characterId: number, key: string, stats: Stats) {
  const full = await bagFull(tx, characterId);
  const loot = await tx.item.create({ data: { characterId, key, ...stats, scrappedAt: full ? new Date() : null } });
  if (full) await tx.character.update({ where: { id: characterId }, data: { gold: { increment: scrapValue(key, stats) } } });
  return loot;
}

/** " Your bag was full, so it was scrapped for 12 gold." for loot scrapped on arrival. */
export const scrappedNote = (loot: Item) => (loot.scrappedAt ? ` Your bag was full, so it was scrapped for ${scrapValue(loot.key, loot)} gold.` : "");

/** Rolls the boss shard for one player: SHARD_CHANCE to get one, its rarity from `rollKey` like the boss loot. Returns the rarity or null. */
export async function giveShard(tx: Prisma.TransactionClient, characterId: number, rollKey: () => string, random: () => number) {
  if (random() >= SHARD_CHANCE) return null;
  const { rarity } = item(rollKey());
  await tx.shard.upsert({
    where: { characterId_rarity: { characterId, rarity } },
    create: { characterId, rarity, count: 1 },
    update: { count: { increment: 1 } },
  });
  return rarity;
}

/** " You also found an epic shard." */
export const shardNote = (rarity: string | null) => (rarity ? ` You also found ${/^[aeiou]/.test(rarity) ? "an" : "a"} ${rarity} shard.` : "");

export const equippedItems = (db: Pick<PrismaClient, "item">, characterId: number) =>
  db.item.findMany({ where: { characterId, equippedSlot: { not: null } } });
