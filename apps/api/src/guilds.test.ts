import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { resolveQuest } from "./quests.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

async function player(name: string) {
  const token = `tq_${name}`;
  const user = await db.user.create({
    data: { character: { create: { name } }, sessions: { create: { tokenHash: hash(token) } } },
    include: { character: true },
  });
  const call = async (method: "GET" | "POST", url: string, payload?: object) =>
    (await buildApp({ db })).inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  return { call, characterId: user.character!.id };
}

test("create, join, leave and hand over leadership", async () => {
  const a = await player("alpha");
  const b = await player("beta");
  const c = await player("gamma");

  const created = await a.call("POST", "/guild", { name: "Night Shift" });
  assert.equal(created.statusCode, 201);
  const { code } = created.json().guild;
  assert.equal((await b.call("POST", "/guild", { name: "Night Shift" })).json().error, "name taken");
  assert.equal((await b.call("POST", "/guild/join", { code })).statusCode, 200);
  await c.call("POST", "/guild/join", { code: code.toLowerCase() });
  assert.equal((await c.call("POST", "/guild", { name: "Other" })).statusCode, 409, "one guild per character");

  assert.equal((await a.call("POST", "/guild/leave")).statusCode, 204);
  const members = (await b.call("GET", "/guild")).json().guild.members;
  assert.deepEqual(members.map((m: { name: string; role: string }) => [m.name, m.role]), [["beta", "leader"], ["gamma", "member"]]);

  await b.call("POST", "/guild/leave");
  await c.call("POST", "/guild/leave");
  assert.equal(await db.guild.count({ where: { name: "Night Shift" } }), 0, "the last member dissolves the guild");
});

test("guild level grows from members' quests", async () => {
  const p = await player("delta");
  await p.call("POST", "/guild", { name: "Day Shift" });
  const quest = await db.quest.create({
    data: { characterId: p.characterId, startedAt: new Date(), endsAt: new Date() },
  });
  await resolveQuest(db, quest.id, () => 0);
  const guild = (await p.call("GET", "/guild")).json().guild;
  assert.equal(guild.xp, 70);
  assert.equal(guild.level, 1);
});

test("quests fill the guild bank on top, members donate", async () => {
  const p = await player("epsilon");
  await p.call("POST", "/guild", { name: "Bank Shift" });
  const quest = await db.quest.create({ data: { characterId: p.characterId, startedAt: new Date(), endsAt: new Date() } });
  await resolveQuest(db, quest.id, () => 0);
  assert.equal((await db.character.findUniqueOrThrow({ where: { id: p.characterId } })).gold, 14, "the player keeps the full reward");
  assert.equal((await p.call("GET", "/guild")).json().guild.gold, 1, "10% of 14 gold, rounded");

  assert.equal((await p.call("POST", "/guild/donate", { amount: 50 })).json().error, "not enough gold");
  const guild = (await p.call("POST", "/guild/donate", { amount: 5 })).json().guild;
  assert.deepEqual([guild.gold, guild.members[0].donated], [6, 5]);
  assert.equal((await db.character.findUniqueOrThrow({ where: { id: p.characterId } })).gold, 9);
});

test("the leader buys buffs that work for every member", async () => {
  const leader = await player("zeta");
  const member = await player("eta");
  const { code } = (await leader.call("POST", "/guild", { name: "Buff Shift" })).json().guild;
  await member.call("POST", "/guild/join", { code });
  // Guild level 3, enough gold for one buff and a bit.
  await db.guild.updateMany({ where: { name: "Buff Shift" }, data: { xp: 4000, gold: 400 } });

  assert.equal((await member.call("POST", "/guild/buffs", { key: "standupSnacks" })).json().error, "only the guild leader can activate buffs");
  assert.equal((await leader.call("POST", "/guild/buffs", { key: "sharedCache" })).json().error, "needs guild level 5");
  const bought = (await leader.call("POST", "/guild/buffs", { key: "standupSnacks" })).json().guild;
  assert.equal(bought.gold, 100);
  assert.ok(bought.buffs.find((b: { key: string }) => b.key === "standupSnacks").endsAt);
  assert.equal((await leader.call("POST", "/guild/buffs", { key: "standupSnacks" })).json().error, "buff already active");
  assert.equal((await leader.call("POST", "/guild/buffs", { key: "bonusRound" })).json().error, "costs 300 gold, the guild bank has 100");

  const quest = await db.quest.create({ data: { characterId: member.characterId, startedAt: new Date(), endsAt: new Date() } });
  assert.equal((await resolveQuest(db, quest.id, () => 0))!.xp, 77, "+10% XP for members too");

  await db.guildBuff.updateMany({ data: { endsAt: new Date(Date.now() - 1) } });
  const later = await db.quest.create({ data: { characterId: member.characterId, startedAt: new Date(), endsAt: new Date() } });
  assert.equal((await resolveQuest(db, later.id, () => 0))!.xp, 70, "an expired buff no longer counts");
});
