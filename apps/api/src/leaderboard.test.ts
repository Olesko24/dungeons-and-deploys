import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

async function player(name: string, xp: number, banned = false) {
  const user = await db.user.create({
    data: { bannedAt: banned ? new Date() : null, character: { create: { name, xp } }, sessions: { create: { tokenHash: hash(`tq_${name}`) } } },
    include: { character: true },
  });
  return user.character!.id;
}
const get = async (name: string, board: string) =>
  (await (await buildApp({ db })).inject({ url: `/leaderboard?board=${board}`, headers: { authorization: `Bearer tq_${name}` } })).json();

test("xp, achievements and guild boards with your own rank", async () => {
  await player("ace", 5000);
  const mid = await player("mid", 900);
  await player("cheat", 99999, true);
  for (let i = 0; i < 25; i++) await player(`filler${i}`, 1000 + i);
  await player("rookie", 10);

  const xp = await get("rookie", "xp");
  assert.equal(xp.top.length, 20);
  assert.deepEqual([xp.top[0].name, xp.top[0].rank, xp.top[0].level], ["ace", 1, 7]);
  assert.ok(!xp.top.some((r: { name: string }) => r.name === "cheat"), "banned players are hidden");
  assert.deepEqual([xp.you.name, xp.you.rank], ["rookie", 28]);

  await db.achievement.createMany({ data: [{ characterId: mid, key: "firstQuest" }, { characterId: mid, key: "founder" }] });
  const ach = await get("mid", "achievements");
  assert.deepEqual([ach.top[0].name, ach.top[0].value, ach.you.rank], ["mid", 2, 1]);
  assert.equal((await get("rookie", "achievements")).you, null, "no achievements, no rank");

  await (await buildApp({ db })).inject({
    method: "POST", url: "/guild", payload: { name: "Top Guild" }, headers: { authorization: "Bearer tq_ace" },
  });
  await db.guild.updateMany({ where: { name: "Top Guild" }, data: { xp: 3000 } });
  const guilds = await get("ace", "guilds");
  assert.deepEqual([guilds.top[0].name, guilds.you.rank], ["Top Guild", 1]);
});
