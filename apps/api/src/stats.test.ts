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
    (await (await buildApp({ db, scheduleResolve: async () => {} })).inject({ url: "/stats", headers: { authorization: "Bearer tq_stat" } })).json();

  const fresh = await get();
  assert.equal(fresh.stats.questsWon, 0);
  assert.ok(fresh.achievements.every((a: { unlocked: boolean }) => !a.unlocked));

  const legendary = await db.item.create({ data: { characterId: id, key: "bow.legendary", attack: 20 } });
  await db.quest.create({ data: { characterId: id, startedAt: new Date(), endsAt: new Date(), resolvedAt: new Date(), success: true, slots: 511, gold: 20, lootItemId: legendary.id } });
  await db.quest.create({ data: { characterId: id, startedAt: new Date(), endsAt: new Date(), resolvedAt: new Date(), success: false, slots: 3 } });
  await db.encounter.create({ data: { characterId: id, monster: "dependencyDragon", level: 1, expiresAt: new Date(), foughtAt: new Date(), won: true, gold: 7 } });
  await db.item.update({ where: { id: legendary.id }, data: { equippedSlot: "mainHand" } });

  const { stats, achievements } = await get();
  assert.deepEqual(
    [stats.questsWon, stats.questsFailed, stats.perfectQuests, stats.presentSlots, stats.goldEarned, stats.dragonsSlain, stats.legendariesFound, stats.equippedSlots],
    [1, 1, 1, 11, 27, 1, 1, 2],
  );
  const unlocked = achievements.filter((a: { unlocked: boolean }) => a.unlocked).map((a: { key: string }) => a.key);
  assert.deepEqual(unlocked, ["firstQuest", "perfect", "firstBlood", "dragon", "legendary"]);
});
