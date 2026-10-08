import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

test("stats and achievements come from what a player did", async () => {
  const user = await db.user.create({
    // The streak is kept by resolving quests, see quests.test.ts. Quests created here directly come with it set.
    data: { character: { create: { name: "stat", xp: 0, bestQuestStreak: 1 } }, sessions: { create: { tokenHash: hash("tq_stat") } } },
    include: { character: true },
  });
  const id = user.character!.id;
  const get = async () =>
    (await (await buildApp({ db })).inject({ url: "/stats", headers: { authorization: "Bearer tq_stat" } })).json();

  const fresh = await get();
  assert.equal(fresh.stats.questsWon, 0);
  assert.ok(fresh.achievements.every((a: { unlockedAt: string | null }) => a.unlockedAt === null));

  const legendary = await db.item.create({ data: { characterId: id, key: "bow.legendary", attack: 20 } });
  await db.quest.create({ data: { characterId: id, startedAt: new Date(), endsAt: new Date(), resolvedAt: new Date(), success: true, gold: 20, lootItemId: legendary.id } });
  await db.quest.create({ data: { characterId: id, startedAt: new Date(), endsAt: new Date(), resolvedAt: new Date(), success: false } });
  await db.encounter.create({ data: { characterId: id, monster: "dependencyDragon", level: 1, expiresAt: new Date(), foughtAt: new Date(), won: true, gold: 7 } });
  await db.item.update({ where: { id: legendary.id }, data: { equippedSlot: "mainHand" } });

  const { stats, achievements } = await get();
  assert.deepEqual(
    [stats.questsWon, stats.questsFailed, stats.longestStreak, stats.goldEarned, stats.dragonsSlain, stats.legendariesFound, stats.equippedSlots],
    [1, 1, 1, 27, 1, 1, 2],
  );
  const unlocked = achievements.filter((a: { unlockedAt: string | null }) => a.unlockedAt).map((a: { key: string }) => a.key);
  assert.deepEqual(unlocked, ["firstQuest", "firstBlood", "dragon", "legendary"]);
});

test("unlocked achievements stay unlocked", async () => {
  await db.user.create({ data: { character: { create: { name: "keeper" } }, sessions: { create: { tokenHash: hash("tq_keeper") } } } });
  const call = async (method: "GET" | "POST", url: string, payload?: object) =>
    (await buildApp({ db })).inject({ method, url, payload, headers: { authorization: "Bearer tq_keeper" } });
  const founder = async () =>
    (await call("GET", "/stats")).json().achievements.find((a: { key: string }) => a.key === "founder").unlockedAt;

  await call("POST", "/guild", { name: "Keepers" });
  // The hook runs after the response, so give it a moment instead of reading /stats (which would sync itself).
  let stored = null;
  for (let i = 0; i < 20 && !stored; i++) {
    await new Promise((r) => setTimeout(r, 25));
    stored = await db.achievement.findFirst({ where: { key: "founder", character: { name: "keeper" } } });
  }
  assert.ok(stored, "the action itself unlocks the achievement");
  const unlockedAt = await founder();
  assert.ok(unlockedAt, "founding a guild unlocks Founder");
  await call("POST", "/guild/leave");
  assert.equal(await founder(), unlockedAt, "leaving the guild keeps it, with its original date");
});

test("finishing the tour unlocks Hello, World, skipping never undoes it", async () => {
  await db.user.create({ data: { character: { create: { name: "tourist" } }, sessions: { create: { tokenHash: hash("tq_tourist") } } } });
  const call = async (method: "GET" | "POST", url: string, payload?: object) =>
    (await buildApp({ db })).inject({ method, url, payload, headers: { authorization: "Bearer tq_tourist" } });
  const tour = async () => (await call("GET", "/character")).json().tour;
  const unlocked = async () =>
    !!(await call("GET", "/stats")).json().achievements.find((a: { key: string }) => a.key === "tour").unlockedAt;

  assert.equal(await tour(), "new");
  assert.equal((await call("POST", "/tour", { done: false })).json().tour, "skipped");
  assert.equal(await unlocked(), false);
  assert.equal((await call("POST", "/tour", { done: true })).json().tour, "done", "a skipped tour can be finished later");
  assert.equal(await unlocked(), true);
  assert.equal((await call("POST", "/tour", { done: false })).json().tour, "done");
});

test("every action keeps the stored combat power current", async () => {
  await db.accessCode.create({ data: { code: "POWER-1", maxUses: 1, expiresAt: new Date(Date.now() + 60_000) } });
  const app = () => buildApp({ db, random: () => 0 });
  const { token } = (await (await app()).inject({ method: "POST", url: "/auth/register", payload: { code: "POWER-1", name: "climber" } })).json();
  const call = async (url: string, payload?: object) =>
    (await app()).inject({ method: "POST", url, payload, headers: { authorization: `Bearer ${token}` } });
  const stored = async () => (await db.character.findFirstOrThrow({ where: { name: "climber" } })).power;
  // The sync runs after the response, so wait for the value to change.
  const changed = async (from: number) => {
    for (let i = 0; i < 40 && (await stored()) === from; i++) await new Promise((r) => setTimeout(r, 25));
    return stored();
  };

  assert.equal(await stored(), 53, "a new character starts with its real power");
  const { id: characterId } = await db.character.findFirstOrThrow({ where: { name: "climber" } });
  const sword = await db.item.create({ data: { characterId, key: "sword.common", attack: 3 } });
  await call(`/inventory/${sword.id}/equip`);
  assert.equal(await changed(53), 84, "equipping counts");
  await call("/talents/learn", { key: "sharpSyntax" });
  assert.equal(await changed(84), 85, "talents count");
  await db.character.update({ where: { id: characterId }, data: { xp: 95 } });
  await call("/quests");
  assert.ok((await changed(85)) > 85, "a level-up from a quest counts");
});
