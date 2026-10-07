import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

let clock = new Date("2026-01-01T12:00:00Z").getTime();

async function player(name: string, gold: number, xp = 0) {
  const token = `tq_${name}`;
  const user = await db.user.create({
    data: { character: { create: { name, gold, xp } }, sessions: { create: { tokenHash: hash(token) } } },
    include: { character: true },
  });
  const call = async (method: "GET" | "POST", url: string, payload?: object) =>
    (await buildApp({ db, now: () => new Date(clock), random: () => 0 })).inject({
      method,
      url,
      payload,
      headers: { authorization: `Bearer ${token}` },
    });
  const characterId = user.character!.id;
  return { call, characterId, gold: async () => (await db.character.findUniqueOrThrow({ where: { id: characterId } })).gold };
}

test("list, draw and payout", async () => {
  const seller = await player("merchant", 0);
  const buyer = await player("hunter", 100);
  const helm = await db.item.create({ data: { characterId: seller.characterId, key: "helm.rare", defense: 4 } });
  const worn = await db.item.create({ data: { characterId: seller.characterId, key: "chest.rare", equippedSlot: "chest" } });

  assert.equal((await seller.call("POST", `/market/list/${worn.id}`)).statusCode, 400, "equipped items cannot be listed");
  assert.equal((await seller.call("POST", `/market/list/${helm.id}`)).statusCode, 204);
  assert.equal((await seller.call("POST", `/inventory/${helm.id}/equip`)).statusCode, 404, "listed items cannot be equipped");
  assert.equal((await seller.call("GET", "/market")).json().offers[1].available, 0, "own listings are not offered");
  assert.equal((await buyer.call("GET", "/market")).json().offers[1].available, 1);

  const draw = await buyer.call("POST", "/market/draw", { rarity: "rare" });
  assert.equal(draw.statusCode, 200);
  assert.equal(draw.json().item.name, "Iron Helm");
  assert.equal(await buyer.gold(), 40);
  assert.equal(await seller.gold(), 54, "seller gets the price minus 10%");
  assert.equal((await db.item.findUniqueOrThrow({ where: { id: helm.id } })).characterId, buyer.characterId);

  await db.item.create({ data: { characterId: seller.characterId, key: "ring.common", listedAt: new Date() } });
  const second = await buyer.call("POST", "/market/draw", { rarity: "common" });
  assert.deepEqual([second.statusCode, second.json().error], [400, "daily draw used, come back tomorrow"]);
  clock += 24 * 60 * 60 * 1000;
  assert.equal((await buyer.call("POST", "/market/draw", { rarity: "common" })).statusCode, 200, "a new day, a new draw");
});

test("draws need gold, a listing and the right level", async () => {
  const seller = await player("smith", 0);
  const poor = await player("squire", 10);
  const rich = await player("baron", 5000);
  await db.item.create({ data: { characterId: seller.characterId, key: "sword.common", attack: 2, listedAt: new Date() } });
  await db.item.create({ data: { characterId: seller.characterId, key: "axe.legendary", attack: 15, listedAt: new Date() } });

  assert.equal((await poor.call("POST", "/market/draw", { rarity: "common" })).json().error, "not enough gold, a common draw costs 20");
  assert.equal((await rich.call("POST", "/market/draw", { rarity: "legendary" })).json().error, "legendary draws unlock at level 10");
  assert.equal((await rich.call("POST", "/market/draw", { rarity: "epic" })).json().error, "epic draws unlock at level 5");
  assert.equal(await rich.gold(), 5000, "failed draws cost nothing");
});
