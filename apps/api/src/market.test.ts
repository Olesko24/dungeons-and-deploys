import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MARKET_DRAW_MS } from "@dnd/shared";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { resolveMarketDraw } from "./market.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

const T0 = new Date("2026-01-01T12:00:00Z").getTime();
let clock = T0;
const scheduled: { itemId: number; at: Date }[] = [];

/** Every test starts with an empty market. */
const clearMarket = () => db.item.updateMany({ data: { listedAt: null, price: null } });

async function player(name: string, gold: number) {
  const token = `tq_${name}`;
  const user = await db.user.create({
    data: { character: { create: { name, gold } }, sessions: { create: { tokenHash: hash(token) } } },
    include: { character: true },
  });
  const app = () => buildApp({ db, now: () => new Date(clock), scheduleDraw: async (itemId, at) => { scheduled.push({ itemId, at }); } });
  const call = async (method: "GET" | "POST", url: string, payload?: object) =>
    (await app()).inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  const characterId = user.character!.id;
  return {
    call,
    characterId,
    gold: async () => (await db.character.findUniqueOrThrow({ where: { id: characterId } })).gold,
    inbox: async () => (await db.notification.findMany({ where: { characterId }, orderBy: { id: "asc" } })).map((n) => n.text),
  };
}

test("list at the suggested or an own price, take it back while nobody waits", async () => {
  clock = T0;
  await clearMarket();
  const seller = await player("merchant", 0);
  const helm = await db.item.create({ data: { characterId: seller.characterId, key: "helm.epic", defense: 10 } });
  const ring = await db.item.create({ data: { characterId: seller.characterId, key: "ring.rare", luck: 2 } });
  const worn = await db.item.create({ data: { characterId: seller.characterId, key: "chest.rare", equippedSlot: "chest" } });

  assert.equal((await seller.call("POST", `/market/list/${worn.id}`)).statusCode, 400, "equipped items cannot be listed");
  const listed = await seller.call("POST", `/market/list/${helm.id}`);
  assert.equal(listed.statusCode, 201);
  assert.equal(listed.json().price, 150, "the best epic roll is worth 125% of 120");
  assert.deepEqual(scheduled.at(-1), { itemId: helm.id, at: new Date(T0 + MARKET_DRAW_MS) }, "the draw is planned");
  assert.equal((await seller.call("POST", `/market/list/${ring.id}`, { price: 999 })).json().price, 999);
  assert.equal((await seller.call("POST", `/inventory/${helm.id}/equip`)).statusCode, 404, "listed items cannot be equipped");

  const mine = (await seller.call("GET", "/market?mine=true")).json().listings;
  assert.deepEqual(mine.map((l: { tag: string; mine: boolean }) => [l.tag, l.mine]), [["fair", true], ["ripoff", true]]);

  assert.equal((await seller.call("POST", `/market/unlist/${ring.id}`)).statusCode, 204);
  assert.equal((await db.item.findUniqueOrThrow({ where: { id: ring.id } })).listedAt, null);
});

test("buyers line up during the window and one of them is drawn", async () => {
  clock = T0;
  await clearMarket();
  const seller = await player("smith", 0);
  const [anna, ben, cora, poor] = [await player("anna", 500), await player("ben", 500), await player("cora", 500), await player("pauper", 10)];
  const axe = await db.item.create({ data: { characterId: seller.characterId, key: "axe.rare", attack: 5 } });
  await seller.call("POST", `/market/list/${axe.id}`, { price: 100 });

  assert.equal((await seller.call("POST", `/market/buy/${axe.id}`)).json().error, "that is your own listing");
  assert.equal((await poor.call("POST", `/market/buy/${axe.id}`)).json().error, "not enough gold, it costs 100");
  assert.deepEqual((await anna.call("POST", `/market/buy/${axe.id}`)).json().state, "queued");
  assert.equal((await anna.call("POST", `/market/buy/${axe.id}`)).statusCode, 409, "nobody stands in line twice");
  await ben.call("POST", `/market/buy/${axe.id}`);
  await cora.call("POST", `/market/buy/${axe.id}`);
  assert.equal(await anna.gold(), 400, "the price is reserved on joining");

  assert.equal((await cora.call("POST", `/market/leave/${axe.id}`)).statusCode, 204);
  assert.equal(await cora.gold(), 500, "leaving refunds the price");
  assert.equal((await seller.call("POST", `/market/unlist/${axe.id}`)).statusCode, 400, "no taking it back with buyers in line");
  const [listing] = (await anna.call("GET", "/market?phase=draw")).json().listings;
  assert.deepEqual([listing.bidders, listing.joined, listing.phase], [2, true, "draw"]);

  assert.equal(await resolveMarketDraw(db, axe.id, () => 0, new Date(T0 + MARKET_DRAW_MS - 1)), null, "no draw before the window ends");
  clock = T0 + MARKET_DRAW_MS;
  assert.equal((await cora.call("POST", `/market/buy/${axe.id}`)).statusCode, 409, "the line closes when the window ends");
  assert.equal((await ben.call("POST", `/market/leave/${axe.id}`)).statusCode, 400);

  // 0.99 picks the second in line.
  await resolveMarketDraw(db, axe.id, () => 0.99, new Date(clock));
  assert.equal((await db.item.findUniqueOrThrow({ where: { id: axe.id } })).characterId, ben.characterId);
  assert.deepEqual([await anna.gold(), await ben.gold(), await seller.gold()], [500, 400, 90]);
  assert.deepEqual(await ben.inbox(), ["You won the draw for Fine Axe (2 in line) and paid 100 gold. It is in your bag."]);
  assert.deepEqual(await anna.inbox(), ["ben won the draw for Fine Axe. Your 100 gold are back."]);
  assert.deepEqual(await seller.inbox(), ["ben won the draw for your Fine Axe (2 in line). You got 90 gold after the 10% fee."]);
  assert.equal(await resolveMarketDraw(db, axe.id, () => 0, new Date(clock)), null, "a second run changes nothing");
});

test("without a line the item can be bought at once after the window", async () => {
  clock = T0;
  await clearMarket();
  const seller = await player("trader", 0);
  const buyer = await player("collector", 300);
  const ring = await db.item.create({ data: { characterId: seller.characterId, key: "ring.uncommon", luck: 2 } });
  const boots = await db.item.create({ data: { characterId: seller.characterId, key: "boots.common", defense: 1 } });
  await seller.call("POST", `/market/list/${ring.id}`, { price: 50 });
  clock = T0 + MARKET_DRAW_MS;
  await seller.call("POST", `/market/list/${boots.id}`, { price: 10 });

  const buyable = (await buyer.call("GET", "/market?phase=buy")).json().listings;
  assert.deepEqual(buyable.map((l: { item: { id: number } }) => l.item.id), [ring.id], "the boots are still in their window");
  assert.deepEqual((await buyer.call("GET", "/market?type=ring&rarity=uncommon")).json().listings.length, 1);
  assert.deepEqual((await buyer.call("GET", "/market?type=boots")).json().listings.length, 1);
  assert.deepEqual((await buyer.call("GET", "/market?sort=price")).json().listings.map((l: { price: number }) => l.price).slice(0, 2), [10, 50]);

  const bought = await buyer.call("POST", `/market/buy/${ring.id}`);
  assert.deepEqual([bought.json().state, bought.json().item.listed], ["bought", false]);
  assert.deepEqual([await buyer.gold(), await seller.gold()], [250, 45]);
  assert.deepEqual(await seller.inbox(), [
    "collector bought your Brass Band for 50 gold. You got 45 gold after the 10% fee.",
    "Achievement unlocked: Merchant. Sell an item on the market.",
  ]);
  assert.equal((await buyer.call("POST", `/market/buy/${ring.id}`)).statusCode, 404, "sold is sold");
});

test("the inbox counts unread entries and can be cleaned up", async () => {
  const p = await player("reader", 0);
  await db.notification.createMany({ data: ["one", "two", "three"].map((text) => ({ characterId: p.characterId, kind: "guild", text })) });
  assert.equal((await p.call("GET", "/character")).json().unread, 3);
  const list = (await p.call("GET", "/inbox")).json().notifications;
  assert.deepEqual(list.map((n: { text: string; unread: boolean }) => [n.text, n.unread]), [["three", true], ["two", true], ["one", true]]);
  assert.equal((await p.call("GET", "/character")).json().unread, 0, "reading the inbox marks it read");

  assert.equal((await p.call("POST", `/inbox/delete/${list[0].id}`)).statusCode, 204);
  assert.deepEqual(await p.inbox(), ["one", "two"]);
  assert.equal((await p.call("POST", "/inbox/clear")).statusCode, 204);
  assert.deepEqual(await p.inbox(), []);
});

test("average sale prices per rarity over the last 7 days", async () => {
  clock = T0;
  const p = await player("appraiser", 0);
  await db.marketDraw.deleteMany();
  const sale = (rarity: string, price: number, daysAgo: number) =>
    ({ buyerId: p.characterId, sellerId: p.characterId, itemId: 0, rarity, price, createdAt: new Date(T0 - daysAgo * 86_400_000) });
  await db.marketDraw.createMany({ data: [sale("epic", 100, 1), sale("epic", 151, 2), sale("rare", 60, 0), sale("epic", 999, 8)] });
  assert.deepEqual((await p.call("GET", "/market/prices")).json(), { epic: { price: 126, sales: 2 }, rare: { price: 60, sales: 1 } });
});
