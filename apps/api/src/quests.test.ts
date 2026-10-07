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
    sendMail: async () => {},
    publicUrl: "http://test",
    scheduleResolve: async (questId, at) => { scheduled.push({ questId, at }); },
    now: () => new Date(clock),
  });

async function player(email: string) {
  const token = `tq_${email}`;
  await db.user.create({
    data: { email, character: { create: { name: email } }, sessions: { create: { tokenHash: hash(token) } } },
  });
  const call = async (method: "GET" | "POST", url: string) =>
    (await app()).inject({ method, url, headers: { authorization: `Bearer ${token}` } });
  return { call, character: () => db.character.findFirstOrThrow({ where: { name: email } }) };
}

const at = (ms: number) => { clock = T0 + ms; };
const lastQuestId = async () => (await db.quest.findFirstOrThrow({ orderBy: { id: "desc" } })).id;

test("quest succeeds with enough presence and grants rewards once", async () => {
  at(0);
  const p = await player("hero@example.com");
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
  assert.deepEqual(late.character, { name: "hero@example.com", gold: 0, level: 1 });

  const id = await lastQuestId();
  assert.deepEqual(await resolveQuest(db, id, () => 0), { success: true, xp: 50, gold: 10 });
  assert.equal(await resolveQuest(db, id, () => 0), null, "second run changes nothing");
  assert.deepEqual((await p.call("GET", "/character")).json(), {
    name: "hero@example.com", xp: 50, gold: 10, level: 1, xpIntoLevel: 50, xpForNext: 100,
  });
});

test("quest fails without enough presence", async () => {
  at(0);
  const p = await player("idle@example.com");
  await p.call("POST", "/quests");
  assert.deepEqual(await resolveQuest(db, await lastQuestId(), () => 0), { success: false, xp: 2, gold: 0 });
  assert.equal((await p.character()).xp, 2);
});

test("cooldown after a quest", async () => {
  at(0);
  const p = await player("eager@example.com");
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
  const p = await player("twin@example.com");
  await p.call("POST", "/quests");
  const { id: characterId } = await p.character();
  await assert.rejects(
    db.quest.create({ data: { characterId, startedAt: new Date(), endsAt: new Date() } }),
    (err: { code?: string }) => err.code === "P2002",
  );
});

test("quest routes need a token", async () => {
  const res = await (await app()).inject({ method: "POST", url: "/quests" });
  assert.equal(res.statusCode, 401);
});
