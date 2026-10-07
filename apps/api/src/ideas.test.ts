import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "./app.ts";
import { hash } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
let clock = Date.parse("2026-10-07T12:00:00Z");
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

async function player(name: string) {
  const token = `tq_${name}`;
  await db.user.create({ data: { character: { create: { name } }, sessions: { create: { tokenHash: hash(token) } } } });
  return async (method: "GET" | "POST", url: string, payload?: object) =>
    (await buildApp({ db, now: () => new Date(clock) })).inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}

test("submit ideas, three a day", async () => {
  const call = await player("dreamer");
  for (const title of ["Pets", "Crafting", "Housing"]) assert.equal((await call("POST", "/ideas", { title })).statusCode, 201);
  const fourth = await call("POST", "/ideas", { title: "Fishing" });
  assert.deepEqual([fourth.statusCode, fourth.json().error], [429, "3 ideas a day, come back tomorrow"]);
  assert.equal((await call("POST", "/ideas", { title: "   " })).statusCode, 400);
  assert.equal((await call("GET", "/ideas")).json().left, 0);

  clock += 24 * 60 * 60 * 1000;
  const next = (await call("GET", "/ideas")).json();
  assert.equal(next.left, 3, "a new day, new ideas");
  assert.equal(next.ideas[0].author, "dreamer");
});

test("one vote per player, a second click takes it back, done ideas sink", async () => {
  const a = await player("voter-a");
  const b = await player("voter-b");
  const { ideas } = (await a("POST", "/ideas", { title: "Dark mode", text: "It is already dark." })).json();
  const id = ideas.find((i: { title: string }) => i.title === "Dark mode").id;

  await a("POST", `/ideas/${id}/vote`);
  const voted = (await b("POST", `/ideas/${id}/vote`)).json().ideas[0];
  assert.deepEqual([voted.id, voted.votes, voted.voted], [id, 2, true], "most votes first");
  const back = (await b("POST", `/ideas/${id}/vote`)).json().ideas.find((i: { id: number }) => i.id === id);
  assert.deepEqual([back.votes, back.voted], [1, false]);
  assert.equal((await a("POST", "/ideas/99999/vote")).statusCode, 404);

  await db.idea.update({ where: { id }, data: { status: "done" } });
  const list = (await a("GET", "/ideas")).json().ideas;
  assert.equal(list.at(-1).id, id, "done ideas come after open ones");
});
