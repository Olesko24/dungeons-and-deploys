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
