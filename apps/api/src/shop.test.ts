import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { shopOffers } from "@dnd/shared";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

let clock = new Date("2026-10-07T12:00:00Z").getTime();

async function player(name: string, gold: number, xp = 0) {
  const token = `tq_${name}`;
  const user = await db.user.create({
    data: { character: { create: { name, gold, xp } }, sessions: { create: { tokenHash: hash(token) } } },
    include: { character: true },
  });
  const call = async (method: "GET" | "POST", url: string, payload?: object) =>
    (await buildApp({ db, now: () => new Date(clock), random: () => 0 })).inject({
      method, url, payload, headers: { authorization: `Bearer ${token}` },
    });
  const characterId = user.character!.id;
  return { call, gold: async () => (await db.character.findUniqueOrThrow({ where: { id: characterId } })).gold };
}

test("buy each daily offer once", async () => {
  const p = await player("shopper", 200);
  const shop = (await p.call("GET", "/shop")).json();
  assert.deepEqual(shop.offers.map((o: { key: string }) => o.key), shopOffers("2026-10-07").map((o) => o.key));

  const bought = await p.call("POST", "/shop/buy", { offer: 1 });
  assert.equal(bought.statusCode, 200);
  assert.equal(bought.json().item.key, shopOffers("2026-10-07")[0].key);
  assert.deepEqual(bought.json().item.stats, shop.offers[0].stats, "the item has the stats the offer showed");
  assert.equal(await p.gold(), 130);
  assert.equal((await p.call("POST", "/shop/buy", { offer: 1 })).json().error, "already bought today");
  assert.equal((await p.call("POST", "/shop/buy", { offer: 3 })).json().error, "not enough gold, this costs 1000", "no level needed, only gold");
  assert.equal((await p.call("GET", "/shop")).json().offers[0].bought, true);

  clock += 24 * 60 * 60 * 1000;
  const next = (await p.call("GET", "/shop")).json();
  assert.equal(next.offers[0].bought, false, "a new day resets purchases");
});

test("no gold, no item", async () => {
  const p = await player("broke", 10);
  assert.equal((await p.call("POST", "/shop/buy", { offer: 1 })).json().error, "not enough gold, this costs 70");
  assert.equal((await p.call("GET", "/shop")).json().offers[0].bought, false, "a failed purchase does not count");
});
