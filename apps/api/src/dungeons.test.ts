import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { DUNGEON_LOBBY_MS, DUNGEON_STAGE_MS } from "@tokenquest/shared";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import { resolveStage } from "./dungeons.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

const T0 = new Date("2026-01-01T12:00:00Z").getTime();
let clock = T0;
const stages: { dungeonId: number; stage: number; at: Date }[] = [];

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
        scheduleStage: async (dungeonId, stage, at) => { stages.push({ dungeonId, stage, at }); },
        now: () => new Date(clock),
        random: () => 0.5,
      })
    ).inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  return { call, characterId: user.character!.id };
}

test("start, join and lobby rules", async () => {
  clock = T0;
  const leader = await player("leader");
  const created = await leader.call("POST", "/dungeons");
  assert.equal(created.statusCode, 201);
  const { code, state } = created.json();
  assert.equal(state, "lobby");
  assert.equal(stages.at(-1)!.at.getTime(), T0 + DUNGEON_LOBBY_MS + DUNGEON_STAGE_MS, "first stage resolves after lobby + 15 min");
  assert.equal((await leader.call("POST", "/dungeons")).statusCode, 409, "one dungeon at a time");

  for (const name of ["m1", "m2", "m3", "m4"]) assert.equal((await (await player(name)).call("POST", "/dungeons/join", { code: code.toLowerCase() })).statusCode, 200);
  assert.equal((await (await player("m5")).call("POST", "/dungeons/join", { code })).json().error, "party is full");

  clock = T0 + DUNGEON_LOBBY_MS;
  assert.equal((await (await player("late")).call("POST", "/dungeons/join", { code })).json().error, "no open dungeon with that code");
  assert.equal((await leader.call("GET", "/dungeons/current")).json().dungeon.members.length, 5);
});

test("a solo run: stages and boss loot", async () => {
  clock = T0;
  const p = await player("solo");
  const { code } = (await p.call("POST", "/dungeons")).json();
  const dungeon = await db.dungeon.findUniqueOrThrow({ where: { code } });

  for (let stage = 0; stage < 4; stage++) {
    const result = await resolveStage(db, dungeon.id, stage, () => 0);
    assert.deepEqual([result?.cleared, result?.next], [true, stage < 3]);
  }
  assert.equal(await resolveStage(db, dungeon.id, 3, () => 0), null, "resolving twice changes nothing");

  const view = (await p.call("GET", "/dungeons/current")).json().dungeon;
  assert.deepEqual([view.state, view.cleared], ["won", 4]);
  assert.ok(view.you.xp > 0);
  assert.equal((await db.dungeonMember.findFirstOrThrow({ where: { characterId: p.characterId } })).lootItemId !== null, true, "the boss drops loot");
  assert.equal((await p.call("POST", "/dungeons")).statusCode, 201, "a finished run frees the player");
});

test("a failed stage ends the run", async () => {
  const p = await player("unlucky");
  const { code } = (await p.call("POST", "/dungeons")).json();
  const dungeon = await db.dungeon.findUniqueOrThrow({ where: { code } });
  assert.equal((await resolveStage(db, dungeon.id, 0, () => 0.99))?.cleared, false);
  const view = (await p.call("GET", "/dungeons/current")).json().dungeon;
  assert.deepEqual([view.state, view.cleared, view.you.xp], ["failed", 0, 0]);
});

test("a 3-player run completes with scaled rewards", async () => {
  clock = T0;
  const solo = await player("lone");
  const soloRun = await db.dungeon.findUniqueOrThrow({ where: { code: (await solo.call("POST", "/dungeons")).json().code } });
  const leader = await player("trio1");
  const { code } = (await leader.call("POST", "/dungeons")).json();
  for (const name of ["trio2", "trio3"]) await (await player(name)).call("POST", "/dungeons/join", { code });
  const trioRun = await db.dungeon.findUniqueOrThrow({ where: { code } });

  for (let stage = 0; stage < 4; stage++) {
    assert.equal((await resolveStage(db, soloRun.id, stage, () => 0))?.cleared, true);
    assert.equal((await resolveStage(db, trioRun.id, stage, () => 0))?.cleared, true);
  }
  const soloXp = (await db.dungeonMember.findFirstOrThrow({ where: { dungeonId: soloRun.id } })).xp;
  const trio = await db.dungeonMember.findMany({ where: { dungeonId: trioRun.id } });
  assert.equal(trio.length, 3);
  for (const m of trio) {
    assert.ok(m.xp > soloXp, "each party member earns more than a solo player");
    assert.ok(m.lootItemId, "every member gets boss loot");
  }
});

test("joins stop at five members", async () => {
  clock = T0;
  const leader = await player("crowd0");
  const { code } = (await leader.call("POST", "/dungeons")).json();
  for (const name of ["crowd1", "crowd2", "crowd3"]) await (await player(name)).call("POST", "/dungeons/join", { code });
  const late = await Promise.all(["crowd4", "crowd5", "crowd6"].map(async (n) => (await player(n)).call("POST", "/dungeons/join", { code })));
  assert.deepEqual(late.map((r) => r.statusCode).sort((a, b) => a - b), [200, 400, 400]);
  const dungeon = await db.dungeon.findUniqueOrThrow({ where: { code }, include: { _count: { select: { members: true } } } });
  assert.equal(dungeon._count.members, 5);
});
