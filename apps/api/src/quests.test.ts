import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { COOLDOWN_MS, QUEST_MS, SLOT_MS } from "@tokenquest/shared";
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
const scheduled: { questId: number; at: Date }[] = [];
// A fresh app per request, so the real-time heartbeat rate limit never interferes with the fake clock.
const app = () =>
  buildApp({
    db,
    scheduleResolve: async (questId, at) => { scheduled.push({ questId, at }); },
    now: () => new Date(clock),
  });

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

test("quest succeeds with enough presence and grants rewards once", async () => {
  at(0);
  const p = await player("hero");
  const start = await p.call("POST", "/quests");
  assert.equal(start.statusCode, 201);
  assert.equal(scheduled.at(-1)!.at.getTime(), T0 + QUEST_MS);
  assert.equal((await p.call("POST", "/quests")).statusCode, 409, "only one quest at a time");

  for (const slot of [2, 4, 6, 8]) {
    at(slot * SLOT_MS + 1000);
    assert.equal((await p.call("POST", "/heartbeat")).statusCode, 200);
  }
  at(QUEST_MS + 1000);
  const late = (await p.call("POST", "/heartbeat")).json();
  assert.equal(late.quest.presentSlots, 5, "heartbeat after the end is ignored");
  assert.deepEqual(late.character, { name: "hero", gold: 0, level: 1 });

  const id = await lastQuestId();
  const result = await resolveQuest(db, id, () => 0);
  assert.deepEqual({ ...result, loot: result?.loot?.name }, { success: true, xp: 50, gold: 10, loot: "Leather Cap" });
  assert.equal(await resolveQuest(db, id, () => 0), null, "second run changes nothing");
  assert.deepEqual((await p.call("GET", "/character")).json(), {
    name: "hero", xp: 50, gold: 10, level: 1, xpIntoLevel: 50, xpForNext: 100, attack: 0, defense: 0, luck: 0, fortune: 0,
  });
});

test("quest fails without enough presence", async () => {
  at(0);
  const p = await player("idle");
  await p.call("POST", "/quests");
  assert.deepEqual(await resolveQuest(db, await lastQuestId(), () => 0), { success: false, xp: 2, gold: 0, loot: null });
  assert.equal((await p.character()).xp, 2);
});

test("cooldown after a quest", async () => {
  at(0);
  const p = await player("eager");
  await p.call("POST", "/quests");
  await resolveQuest(db, await lastQuestId(), () => 0);

  at(QUEST_MS + COOLDOWN_MS - 1);
  const early = await p.call("POST", "/quests");
  assert.equal(early.statusCode, 409);
  assert.equal(early.json().error, "cooldown");

  at(QUEST_MS + COOLDOWN_MS);
  assert.equal((await p.call("POST", "/quests")).statusCode, 201);
});

test("database allows only one running quest per character", async () => {
  at(0);
  const p = await player("twin");
  await p.call("POST", "/quests");
  const { id: characterId } = await p.character();
  await assert.rejects(
    db.quest.create({ data: { characterId, startedAt: new Date(), endsAt: new Date() } }),
    (err: { code?: string }) => err.code === "P2002",
  );
});

test("loot lands in the inventory and equipment raises the odds", async () => {
  at(0);
  const p = await player("looter");
  await p.call("POST", "/quests");
  const first = await lastQuestId();
  await db.quest.update({ where: { id: first }, data: { slots: 0b11111 } });
  await resolveQuest(db, first, () => 0);
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

  // A quest with 5 present slots: 60% base + 15 luck = 75%.
  at(QUEST_MS + COOLDOWN_MS);
  await p.call("POST", "/quests");
  const id = await lastQuestId();
  await db.quest.update({ where: { id }, data: { slots: 0b11111 } });
  assert.equal((await resolveQuest(db, id, () => 0.7))!.success, true);
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

test("a quest whose job cannot be planned is undone", async () => {
  at(0);
  const p = await player("unplanned");
  const failing = await buildApp({ db, scheduleResolve: async () => { throw new Error("queue down"); }, now: () => new Date(clock) });
  const res = await failing.inject({ method: "POST", url: "/quests", headers: { authorization: "Bearer tq_unplanned" } });
  assert.equal(res.statusCode, 500);
  assert.equal(await db.quest.count({ where: { character: { name: "unplanned" } } }), 0, "no quest left behind to block the next one");
  assert.equal((await p.call("POST", "/quests")).statusCode, 201);
});

test("quest routes need a token", async () => {
  const res = await (await app()).inject({ method: "POST", url: "/quests" });
  assert.equal(res.statusCode, 401);
});
