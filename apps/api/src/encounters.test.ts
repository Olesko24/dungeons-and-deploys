import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ENCOUNTER_MS } from "@dnd/shared";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

const T0 = new Date("2026-01-01T12:00:00Z").getTime();
let clock = T0;
let dice = () => 0;

async function player(name: string) {
  const token = `tq_${name}`;
  const user = await db.user.create({
    data: { character: { create: { name } }, sessions: { create: { tokenHash: hash(token) } } },
    include: { character: true },
  });
  const call = async (method: "GET" | "POST", url: string) =>
    (await buildApp({ db, now: () => new Date(clock), random: () => dice() })).inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
    });
  return { call, characterId: user.character!.id };
}

test("a heartbeat can spawn one monster at a time", async () => {
  clock = T0;
  dice = () => 0;
  const p = await player("ranger");
  const status = (await p.call("POST", "/heartbeat")).json();
  assert.equal(status.encounter.name, "Bug Swarm");
  assert.equal(status.encounter.winChance, 0.625, "unequipped level 1 against a bug swarm");
  await p.call("POST", "/heartbeat");
  assert.equal(await db.encounter.count({ where: { characterId: p.characterId } }), 1, "no second monster while one is around");

  dice = () => 0.5;
  const other = await player("bard");
  assert.equal((await other.call("POST", "/heartbeat")).json().encounter, null, "98% of heartbeats spawn nothing");
});

test("fight a monster once", async () => {
  clock = T0;
  dice = () => 0;
  const p = await player("warrior");
  await p.call("POST", "/heartbeat");

  const res = await p.call("POST", "/fight");
  assert.equal(res.statusCode, 200);
  const fight = res.json();
  assert.equal(fight.won, true);
  assert.deepEqual([fight.monster, fight.xp, fight.gold], ["Bug Swarm", 8, 2]);
  assert.equal(fight.loot.name, "Leather Cap");
  const character = await db.character.findUniqueOrThrow({ where: { id: p.characterId } });
  assert.deepEqual([character.xp, character.gold], [8, 2]);

  assert.equal((await p.call("POST", "/fight")).statusCode, 404, "a monster can be fought only once");
  assert.equal((await p.call("GET", "/quests/current")).json().encounter, null);
});

test("losing gives nothing, a monster leaves after 5 minutes", async () => {
  clock = T0;
  dice = () => 0;
  const p = await player("mage");
  await p.call("POST", "/heartbeat");
  dice = () => 0.99;
  const lost = (await p.call("POST", "/fight")).json();
  assert.deepEqual([lost.won, lost.xp, lost.gold, lost.loot], [false, 0, 0, null]);

  clock = T0 + 60_000;
  dice = () => 0;
  await p.call("POST", "/heartbeat");
  clock += ENCOUNTER_MS;
  assert.equal((await p.call("POST", "/fight")).statusCode, 404, "expired");
});
