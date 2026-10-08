import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { COOLDOWN_MS } from "@dnd/shared";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { resolveQuest } from "./quests.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

const T0 = new Date("2026-01-01T12:00:00Z").getTime();
let clock = T0;
let dice = 0;
// A fresh app per request, so the real-time heartbeat rate limit never interferes with the fake clock.
const app = () => buildApp({ db, now: () => new Date(clock), random: () => dice });

async function player(name: string) {
  const token = `tq_${name}`;
  await db.user.create({
    data: { character: { create: { name } }, sessions: { create: { tokenHash: hash(token) } } },
  });
  const call = async (method: "GET" | "POST", url: string) =>
    (await app()).inject({ method, url, headers: { authorization: `Bearer ${token}` } });
  return { call, character: () => db.character.findFirstOrThrow({ where: { name } }) };
}

const at = (ms: number) => { clock = T0 + ms; };
const lastQuestId = async () => (await db.quest.findFirstOrThrow({ orderBy: { id: "desc" } })).id;

test("a quest resolves at once and reports its rewards", async () => {
  at(0);
  dice = 0;
  const p = await player("hero");
  const start = await p.call("POST", "/quests");
  assert.equal(start.statusCode, 201);
  const { name, story, ...result } = start.json();
  assert.ok(name && story);
  assert.deepEqual({ ...result, loot: result.loot.name }, {
    success: true, xp: 70, gold: 14, loot: "Leather Cap", readyAt: new Date(T0 + COOLDOWN_MS).toISOString(),
  });
  assert.equal((await p.call("GET", "/quests/current")).json().quest.name, name);
  assert.deepEqual((await p.call("GET", "/character")).json(), {
    name: "hero", xp: 70, gold: 14, tour: "new", level: 1, xpIntoLevel: 70, xpForNext: 100, attack: 0, defense: 0, luck: 0, fortune: 0, power: 53, unread: 1,
  });
  assert.equal(await resolveQuest(db, await lastQuestId(), () => 0), null, "second run changes nothing");
});

test("a quest can fail on the dice", async () => {
  at(0);
  dice = 0.99;
  const p = await player("unlucky");
  const res = (await p.call("POST", "/quests")).json();
  assert.deepEqual([res.success, res.xp, res.gold, res.loot], [false, 10, 0, null]);
  assert.equal((await p.character()).xp, 10);
});

test("cooldown after a quest", async () => {
  at(0);
  const p = await player("eager");
  await p.call("POST", "/quests");

  at(COOLDOWN_MS - 1);
  const early = await p.call("POST", "/quests");
  assert.equal(early.statusCode, 409);
  assert.equal(early.json().error, "cooldown");

  at(COOLDOWN_MS);
  assert.equal((await p.call("POST", "/quests")).statusCode, 201);
});

test("parallel starts give only one quest", async () => {
  at(0);
  const p = await player("twin");
  const codes = (await Promise.all([p.call("POST", "/quests"), p.call("POST", "/quests")])).map((r) => r.statusCode);
  assert.deepEqual(codes.sort((a, b) => a - b), [201, 409]);
});

test("loot lands in the inventory and equipment raises the odds", async () => {
  at(0);
  dice = 0;
  const p = await player("looter");
  await p.call("POST", "/quests");
  const inv = (await p.call("GET", "/inventory")).json();
  assert.equal(inv.items.length, 1);
  assert.deepEqual(inv.items[0].stats, { attack: 0, defense: 1, luck: 0, fortune: 0 }, "stats are rolled on drop");
  assert.equal((await p.call("GET", "/quests/current")).json().quest.loot.name, "Leather Cap");

  const { id: characterId } = await p.character();
  await db.item.create({ data: { characterId, key: "ring.legendary", luck: 8, defense: 5, attack: 5, fortune: 12 } });
  await db.item.create({ data: { characterId, key: "ring.epic", luck: 5, attack: 3, fortune: 8 } });
  await db.item.create({ data: { characterId, key: "chest.rare", defense: 6, luck: 2 } });
  for (const i of (await p.call("GET", "/inventory")).json().items) {
    assert.equal((await p.call("POST", `/inventory/${i.id}/equip`)).statusCode, 200);
  }
  const sheet = (await p.call("GET", "/character")).json();
  assert.deepEqual([sheet.attack, sheet.defense, sheet.luck, sheet.fortune], [8, 12, 15, 20]);
  const names = (await p.call("GET", "/inventory")).json().items.map((i: { name: string }) => i.name);
  assert.deepEqual(names, ["Leather Cap", "Merchant's Signet of Root", "Merchant's Ring of Caching", "Gambler's Chainmail"]);

  // 75% base + 15 luck = 90%: a roll of 0.85 fails without the gear and succeeds with it.
  at(COOLDOWN_MS);
  dice = 0.85;
  assert.equal((await p.call("POST", "/quests")).json().success, true);
});

test("after three successful quests without loot the next one drops an item", async () => {
  // 0.5 succeeds (75%) but misses the 40% drop chance.
  dice = 0.5;
  const p = await player("dry");
  const loot = [];
  for (let i = 0; i < 5; i++) {
    at(i * COOLDOWN_MS);
    loot.push(!!(await p.call("POST", "/quests")).json().loot);
  }
  assert.deepEqual(loot, [false, false, false, true, false]);
});

test("equip and unequip", async () => {
  const p = await player("knight");
  const { id: characterId } = await p.character();
  const axe = await db.item.create({ data: { characterId, key: "battleAxe.common" } });
  const shield = await db.item.create({ data: { characterId, key: "shield.common" } });
  const other = await player("thief");

  await p.call("POST", `/inventory/${axe.id}/equip`);
  const res = await p.call("POST", `/inventory/${shield.id}/equip`);
  assert.deepEqual(res.json(), { slot: "offHand", unequipped: [axe.id] }, "shield replaces the two-hander");
  assert.equal((await other.call("POST", `/inventory/${shield.id}/equip`)).statusCode, 404, "only own items");
  assert.equal((await p.call("POST", `/inventory/${shield.id}/unequip`)).statusCode, 204);
  assert.equal((await p.call("GET", "/inventory")).json().items.filter((i: { equippedSlot: string | null }) => i.equippedSlot).length, 0);
});

test("quest routes need a token", async () => {
  const res = await (await app()).inject({ method: "POST", url: "/quests" });
  assert.equal(res.statusCode, 401);
});
