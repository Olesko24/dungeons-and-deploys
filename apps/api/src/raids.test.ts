import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { RAID_TICKS } from "@tokenquest/shared";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { advanceRaid } from "./raids.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

const T0 = new Date("2026-01-01T18:00:00Z").getTime();
let clock = T0;
const ticks: { raidId: number; tick: number; at: Date }[] = [];

async function player(name: string) {
  const token = `tq_${name}`;
  const user = await db.user.create({
    data: { character: { create: { name } }, sessions: { create: { tokenHash: hash(token) } } },
    include: { character: true },
  });
  const call = async (method: "GET" | "POST", url: string, payload?: object) =>
    (
      await buildApp({
        db,
        scheduleResolve: async () => {},
        scheduleRaid: async (raidId, tick, at) => { ticks.push({ raidId, tick, at }); },
        now: () => new Date(clock),
      })
    ).inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  return { call, characterId: user.character!.id };
}

async function guildWith(prefix: string, size: number) {
  const players = [];
  for (let i = 0; i < size; i++) players.push(await player(`${prefix}${i}`));
  const { code } = (await players[0].call("POST", "/guild", { name: `${prefix} guild` })).json().guild;
  for (const p of players.slice(1)) await p.call("POST", "/guild/join", { code });
  return players;
}

async function runRaid(players: Awaited<ReturnType<typeof player>>[], dice: number) {
  clock = T0;
  const created = await players[0].call("POST", "/raids", { startsInMinutes: 10 });
  assert.equal(created.statusCode, 201);
  for (const p of players.slice(1)) assert.equal((await p.call("POST", "/raids/join")).statusCode, 200);
  const raid = await db.raid.findFirstOrThrow({ where: { members: { some: { characterId: players[0].characterId } } } });
  assert.equal(ticks.at(-1)!.at.getTime(), T0 + 10 * 60_000);

  let result = await advanceRaid(db, raid.id, 0, () => dice);
  for (let tick = 1; result?.next && tick <= RAID_TICKS; tick++) result = await advanceRaid(db, raid.id, tick, () => dice);
  return { raid, view: (await players[0].call("GET", "/raids/current")).json().raid };
}

test("five raiders beat the boss in good phases and all get loot", async () => {
  const players = await guildWith("win", 5);
  assert.equal((await players[1].call("POST", "/raids", { startsInMinutes: 10 })).statusCode, 403, "only the leader schedules");
  const { raid, view } = await runRaid(players, 0.9);
  assert.equal(view.state, "won");
  assert.equal(view.bossHp, 0);
  const members = await db.raidMember.findMany({ where: { raidId: raid.id } });
  assert.ok(members.every((m) => m.damage > 0 && m.lootItemId), "everyone dealt damage and got loot");
  assert.ok((await db.guild.findFirstOrThrow({ where: { name: "win guild" } })).xp > 0, "raid feeds guild XP");
});

test("a raid fails when the boss rolls tough phases", async () => {
  const { view } = await runRaid(await guildWith("tough", 5), 0);
  assert.equal(view.state, "failed");
  assert.ok(view.bossHp > 0);
});

test("a raid below the minimum is cancelled", async () => {
  const { view } = await runRaid(await guildWith("few", 3), 0.9);
  assert.equal(view.state, "cancelled");
});
