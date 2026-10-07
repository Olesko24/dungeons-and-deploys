import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

/** Level 6, so 6 talent points. */
const LEVEL_6_XP = 2821;

async function player(name: string, gold: number) {
  const token = `tq_${name}`;
  await db.user.create({
    data: { character: { create: { name, gold, xp: LEVEL_6_XP } }, sessions: { create: { tokenHash: hash(token) } } },
  });
  return async (method: "GET" | "POST", url: string, payload?: object) =>
    (await buildApp({ db })).inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}

test("learn talents within points and tiers, reset for gold", async () => {
  const call = await player("talented", 100);
  assert.equal((await call("POST", "/talents/learn", { key: "nope" })).statusCode, 400);
  assert.equal((await call("POST", "/talents/learn", { key: "hotPath" })).json().error, "needs 5 points in offense");
  for (let i = 0; i < 5; i++) assert.equal((await call("POST", "/talents/learn", { key: "sharpSyntax" })).statusCode, 200);
  const learned = (await call("POST", "/talents/learn", { key: "hotPath" })).json();
  assert.deepEqual([learned.points, learned.spent, learned.resetCost, learned.bonus.power, learned.bonus.raidDamage], [6, 6, 60, 5, 2]);
  assert.equal((await call("POST", "/talents/learn", { key: "haggler" })).json().error, "no talent points left");

  const reset = (await call("POST", "/talents/reset")).json();
  assert.deepEqual([reset.spent, reset.gold], [0, 40]);
  assert.equal((await call("POST", "/talents/reset")).json().error, "no talents to reset");
});

test("reset needs the gold", async () => {
  const call = await player("broke", 0);
  await call("POST", "/talents/learn", { key: "haggler" });
  assert.equal((await call("POST", "/talents/reset")).json().error, "resetting costs 10 gold");
});

test("parallel learning cannot overspend", async () => {
  const call = await player("greedy", 0);
  const keys = ["fastLearner", "haggler"];
  await Promise.all(Array.from({ length: 9 }, (_, i) => call("POST", "/talents/learn", { key: keys[i % 2] })));
  assert.equal((await call("GET", "/talents")).json().spent, 6);
});
