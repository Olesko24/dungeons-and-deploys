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
    data: { character: { create: { name: "stat", xp: 0 } }, sessions: { create: { tokenHash: hash("tq_stat") } } },
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
