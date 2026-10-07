import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { RAID_TICKS, RAID_TICK_MS } from "@tokenquest/shared";
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

async function runRaid(players: Awaited<ReturnType<typeof player>>[], presence: number) {
  clock = T0;
  const created = await players[0].call("POST", "/raids", { startsInMinutes: 10 });
  assert.equal(created.statusCode, 201);
  for (const p of players.slice(1)) assert.equal((await p.call("POST", "/raids/join")).statusCode, 200);
  const raid = await db.raid.findFirstOrThrow({ where: { members: { some: { characterId: players[0].characterId } } } });
  assert.equal(ticks.at(-1)!.at.getTime(), T0 + 10 * 60_000);

  await db.raidMember.updateMany({ where: { raidId: raid.id }, data: { slots: presence } });
  let result = await advanceRaid(db, raid.id, 0, () => 0.5);
  for (let tick = 1; result?.next && tick <= RAID_TICKS; tick++) result = await advanceRaid(db, raid.id, tick, () => 0.5);
  return { raid, view: (await players[0].call("GET", "/raids/current")).json().raid };
}

test("five present raiders beat the boss and all get loot", async () => {
  const players = await guildWith("win", 5);
  assert.equal((await players[1].call("POST", "/raids", { startsInMinutes: 10 })).statusCode, 403, "only the leader schedules");
  const { raid, view } = await runRaid(players, 0b111111);
  assert.equal(view.state, "won");
  assert.equal(view.bossHp, 0);
  const members = await db.raidMember.findMany({ where: { raidId: raid.id } });
  assert.ok(members.every((m) => m.damage > 0 && m.lootItemId), "everyone dealt damage and got loot");
  assert.ok((await db.guild.findFirstOrThrow({ where: { name: "win guild" } })).xp > 0, "raid feeds guild XP");
});

test("a raid fails when members are away", async () => {
  const { view } = await runRaid(await guildWith("away", 5), 0b000111);
  assert.equal(view.state, "failed");
  assert.ok(view.bossHp > 0);
});

test("a raid below the minimum is cancelled", async () => {
  const { view } = await runRaid(await guildWith("few", 3), 0b111111);
  assert.equal(view.state, "cancelled");
});

test("heartbeats mark raid presence per tick", async () => {
  const players = await guildWith("beat", 5);
  clock = T0;
  await players[0].call("POST", "/raids", { startsInMinutes: 5 });
  const raid = await db.raid.findFirstOrThrow({ where: { members: { some: { characterId: players[0].characterId } } } });
  for (const p of players.slice(1)) await p.call("POST", "/raids/join");
  await advanceRaid(db, raid.id, 0);
  clock = T0 + 5 * 60_000 + 2 * RAID_TICK_MS + 1000;
  await players[0].call("POST", "/heartbeat");
  const member = await db.raidMember.findFirstOrThrow({ where: { raidId: raid.id, characterId: players[0].characterId } });
  assert.equal(member.slots, 0b100, "third tick");
});
