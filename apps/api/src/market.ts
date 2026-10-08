import type { FastifyInstance } from "fastify";
import {
  ITEM_BASES,
  ITEM_TYPES,
  MARKET_DRAW_MS,
  MARKET_MAX_PRICE,
  RARITIES,
  item,
  itemName,
  marketValue,
  priceTag,
  sellerPayout,
} from "@dnd/shared";
import type { Deps } from "./app.ts";
import { BAG_FULL, bagFull, itemView, requireCharacter } from "./characters.ts";
import { notify } from "./inbox.ts";
import { trySyncProgress } from "./stats.ts";
import type { Prisma, PrismaClient } from "./generated/prisma/client.ts";

export const drawAt = (listedAt: Date) => new Date(listedAt.getTime() + MARKET_DRAW_MS);
const PRICES_MS = 7 * 24 * 60 * 60 * 1000;

/** Locks the item row, so buying, joining, leaving and the draw of one listing run one after another. */
const lock = (tx: Prisma.TransactionClient, itemId: number) => tx.$queryRaw`SELECT id FROM items WHERE id = ${itemId} FOR UPDATE`;

/** Item bases per type, e.g. every one-handed weapon kind for `weapon`. */
const basesOf = (type: string) => ITEM_BASES.filter((b) => item(`${b}.common`).type === type);

type BuyResult = { code: number; error: string } | { body: object; sellerId: number | null };

type Query = { rarity?: string; type?: string; phase?: "draw" | "buy"; sort?: "price" | "ending"; mine?: boolean };

export function marketRoutes(app: FastifyInstance, { db, now, scheduleDraw }: Required<Deps>) {
  app.get<{ Querystring: Query }>(
    "/market",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            rarity: { type: "string", enum: [...RARITIES] },
            type: { type: "string", enum: [...ITEM_TYPES] },
            phase: { type: "string", enum: ["draw", "buy"] },
            sort: { type: "string", enum: ["price", "ending"] },
            mine: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const { rarity, type, phase, sort, mine } = req.query;
      const t = now();
      const windowStart = new Date(t.getTime() - MARKET_DRAW_MS);
      const rows = await db.item.findMany({
        where: {
          listedAt: phase === "draw" ? { gt: windowStart } : phase === "buy" ? { lte: windowStart } : { not: null },
          ...(phase === "buy" ? { bids: { none: {} } } : {}),
          ...(mine ? { characterId: character.id } : {}),
          AND: [
            rarity ? { key: { endsWith: `.${rarity}` } } : {},
            type ? { OR: basesOf(type).map((b) => ({ key: { startsWith: `${b}.` } })) } : {},
          ],
        },
        orderBy: sort === "price" ? [{ price: "asc" }, { id: "asc" }] : [{ listedAt: "asc" }, { id: "asc" }],
        take: 100,
        include: { character: true, bids: { select: { characterId: true } } },
      });
      return {
        gold: character.gold,
        listings: rows.map((i) => {
          const value = marketValue(i.key, i);
          const at = drawAt(i.listedAt!);
          return {
            item: itemView(i),
            seller: i.character.name,
            price: i.price!,
            value,
            tag: priceTag(i.price!, value),
            drawAt: at,
            // "drawing": the window is over and the draw job has not run yet.
            phase: t < at ? "draw" : i.bids.length ? "drawing" : "buy",
            bidders: i.bids.length,
            joined: i.bids.some((b) => b.characterId === character.id),
            mine: i.characterId === character.id,
          };
        }),
      };
    },
  );

  /** Average sale price and number of sales per rarity over the last 7 days. */
  app.get("/market/prices", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const rows = await db.marketDraw.groupBy({
      by: ["rarity"],
      where: { createdAt: { gt: new Date(now().getTime() - PRICES_MS) } },
      _avg: { price: true },
      _count: true,
    });
    return Object.fromEntries(rows.map((r) => [r.rarity, { price: Math.round(r._avg.price ?? 0), sales: r._count }]));
  });

  /** Lists a bag item. Without a price it goes up at the suggested value. */
  app.post<{ Params: { id: string }; Body: { price?: number } | undefined }>(
    "/market/list/:id",
    { schema: { body: { type: ["object", "null"], properties: { price: { type: "integer", minimum: 1, maximum: MARKET_MAX_PRICE } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const target = await db.item.findFirst({ where: { id: Number(req.params.id) || 0, characterId: character.id, equippedSlot: null, listedAt: null, scrappedAt: null } });
      if (!target) return reply.code(400).send({ error: "item not found, equipped or already listed" });
      const price = req.body?.price ?? marketValue(target.key, target);
      const t = now();
      const listed = await db.item.updateMany({ where: { id: target.id, equippedSlot: null, listedAt: null, scrappedAt: null }, data: { listedAt: t, price } });
      if (listed.count === 0) return reply.code(400).send({ error: "item not found, equipped or already listed" });
      await scheduleDraw(target.id, drawAt(t)).catch(async (err) => {
        await db.item.update({ where: { id: target.id }, data: { listedAt: null, price: null } });
        throw err;
      });
      return reply.code(201).send({ price, drawAt: drawAt(t) });
    },
  );

  /** Takes a listing back, as long as nobody is in line for it. */
  app.post<{ Params: { id: string } }>("/market/unlist/:id", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const itemId = Number(req.params.id) || 0;
    const unlisted = await db.$transaction(async (tx) => {
      await lock(tx, itemId);
      return tx.item.updateMany({
        where: { id: itemId, characterId: character.id, listedAt: { not: null }, bids: { none: {} } },
        data: { listedAt: null, price: null },
      });
    });
    if (unlisted.count === 0) return reply.code(400).send({ error: "not listed, or buyers are already in line" });
    return reply.code(204).send();
  });

  /** During the draw window this joins the line and reserves the price. Afterwards, without a line, it buys at once. */
  app.post<{ Params: { id: string } }>("/market/buy/:id", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const itemId = Number(req.params.id) || 0;
    const t = now();
    const result = await db.$transaction(async (tx): Promise<BuyResult> => {
      await lock(tx, itemId);
      const listing = await tx.item.findUnique({ where: { id: itemId }, include: { bids: true } });
      if (!listing?.listedAt || listing.price === null) return { code: 404, error: "not on the market" };
      if (listing.characterId === character.id) return { code: 400, error: "that is your own listing" };
      const price = listing.price;
      const at = drawAt(listing.listedAt);
      if (t >= at && listing.bids.length) return { code: 409, error: "the draw for this item is running, try again in a moment" };
      if (listing.bids.some((b) => b.characterId === character.id)) return { code: 409, error: "you are already in line" };
      // A winner gets the item even if the bag filled up while waiting for the draw.
      if (await bagFull(tx, character.id)) return { code: 400, error: BAG_FULL };

      const paid = await tx.character.updateMany({ where: { id: character.id, gold: { gte: price } }, data: { gold: { decrement: price } } });
      if (paid.count === 0) return { code: 400, error: `not enough gold, it costs ${price}` };

      if (t < at) {
        await tx.marketBid.create({ data: { itemId, characterId: character.id, price } });
        return { body: { state: "queued", drawAt: at, bidders: listing.bids.length + 1 }, sellerId: null };
      }
      await tx.item.update({ where: { id: itemId }, data: { characterId: character.id, listedAt: null, price: null } });
      await tx.character.update({ where: { id: listing.characterId }, data: { gold: { increment: sellerPayout(price) } } });
      await tx.marketDraw.create({ data: { buyerId: character.id, sellerId: listing.characterId, itemId, rarity: item(listing.key).rarity, price, createdAt: t } });
      await notify(tx, [listing.characterId], "market",
        `${character.name} bought your ${itemName(listing.key, listing)} for ${price} gold. You got ${sellerPayout(price)} gold after the 10% fee.`);
      const bought = await tx.item.findUniqueOrThrow({ where: { id: itemId } });
      return { body: { state: "bought", item: itemView(bought) }, sellerId: listing.characterId };
    });
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    if (result.sellerId) await trySyncProgress(db, result.sellerId);
    return result.body;
  });

  /** Leaves the line before the draw and refunds the reserved price. */
  app.post<{ Params: { id: string } }>("/market/leave/:id", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const itemId = Number(req.params.id) || 0;
    const error = await db.$transaction(async (tx) => {
      await lock(tx, itemId);
      const listing = await tx.item.findUnique({ where: { id: itemId } });
      const bid = await tx.marketBid.findUnique({ where: { itemId_characterId: { itemId, characterId: character.id } } });
      if (!bid || !listing?.listedAt) return "you are not in line for this item";
      if (now() >= drawAt(listing.listedAt)) return "the draw for this item is running";
      await tx.marketBid.delete({ where: { itemId_characterId: { itemId, characterId: character.id } } });
      await tx.character.update({ where: { id: character.id }, data: { gold: { increment: bid.price } } });
      return null;
    });
    if (error) return reply.code(400).send({ error });
    return reply.code(204).send();
  });
}

/**
 * Draws one buyer from the line once the window is over. The winner gets the item, the seller the price minus the fee,
 * everyone else their gold back. Safe to run twice: a drawn listing has no line left.
 */
export function resolveMarketDraw(db: PrismaClient, itemId: number, random = Math.random, t = new Date()) {
  return db.$transaction(async (tx) => {
    await lock(tx, itemId);
    const listing = await tx.item.findUnique({
      where: { id: itemId },
      include: { bids: { include: { character: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!listing?.listedAt || listing.price === null || t < drawAt(listing.listedAt) || !listing.bids.length) return null;
    const { bids } = listing;
    const winner = bids[Math.floor(random() * bids.length)];
    const { price } = winner;
    const losers = bids.filter((b) => b !== winner);
    const name = itemName(listing.key, listing);

    await tx.item.update({ where: { id: itemId }, data: { characterId: winner.characterId, listedAt: null, price: null } });
    await tx.character.update({ where: { id: listing.characterId }, data: { gold: { increment: sellerPayout(price) } } });
    for (const b of losers) await tx.character.update({ where: { id: b.characterId }, data: { gold: { increment: b.price } } });
    await tx.marketBid.deleteMany({ where: { itemId } });
    await tx.marketDraw.create({ data: { buyerId: winner.characterId, sellerId: listing.characterId, itemId, rarity: item(listing.key).rarity, price, createdAt: t } });

    const line = `${bids.length} in line`;
    await notify(tx, [listing.characterId], "market",
      `${winner.character.name} won the draw for your ${name} (${line}). You got ${sellerPayout(price)} gold after the 10% fee.`);
    await notify(tx, [winner.characterId], "market", `You won the draw for ${name} (${line}) and paid ${price} gold. It is in your bag.`);
    await notify(tx, losers.map((b) => b.characterId), "market", `${winner.character.name} won the draw for ${name}. Your ${price} gold are back.`);
    return { sellerId: listing.characterId, winnerId: winner.characterId };
  });
}
