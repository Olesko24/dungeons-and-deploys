import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "./app.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

const app = () => buildApp({ db });
const post = async (url: string, payload?: object, token?: string) =>
  (await app()).inject({ method: "POST", url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
const characterName = async (token: string) =>
  (await (await app()).inject({ url: "/character", headers: { authorization: `Bearer ${token}` } })).json().name;

test("register with access code", async () => {
  await db.accessCode.create({ data: { code: "TEST-0001", maxUses: 2, expiresAt: new Date(Date.now() + 60_000) } });

  assert.equal((await post("/auth/register", { code: "WRONG", name: "hero" })).statusCode, 400);
  assert.equal((await post("/auth/register", { code: "TEST-0001", name: "x" })).statusCode, 400, "name too short");

  const res = await post("/auth/register", { code: "test-0001", name: "hero" });
  assert.equal(res.statusCode, 200);
  assert.equal(await characterName(res.json().token), "hero");

  assert.equal((await post("/auth/register", { code: "TEST-0001", name: "hero" })).statusCode, 409, "name taken");
  assert.equal((await db.accessCode.findUniqueOrThrow({ where: { code: "TEST-0001" } })).uses, 1, "taken name keeps the use");
  assert.equal((await post("/auth/register", { code: "TEST-0001", name: "mage" })).statusCode, 200);
  assert.equal((await post("/auth/register", { code: "TEST-0001", name: "rogue" })).statusCode, 400, "code used up");
});

test("expired access code is rejected", async () => {
  await db.accessCode.create({ data: { code: "TEST-0002", maxUses: 5, expiresAt: new Date(Date.now() - 1) } });
  assert.equal((await post("/auth/register", { code: "TEST-0002", name: "late" })).statusCode, 400);
});

test("pair a second device", async () => {
  await db.accessCode.create({ data: { code: "TEST-0003", maxUses: 1, expiresAt: new Date(Date.now() + 60_000) } });
  const { token } = (await post("/auth/register", { code: "TEST-0003", name: "paladin" })).json();

  assert.equal((await post("/auth/pair")).statusCode, 401);
  const { code } = (await post("/auth/pair", undefined, token)).json();
  const second = await post("/auth/pair/redeem", { code: code.toLowerCase() });
  assert.equal(second.statusCode, 200);
  assert.notEqual(second.json().token, token);
  assert.equal(await characterName(second.json().token), "paladin");
  assert.equal((await post("/auth/pair/redeem", { code })).statusCode, 400, "pair code is single-use");

  const { code: old } = (await post("/auth/pair", undefined, token)).json();
  await db.pairCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal((await post("/auth/pair/redeem", { code: old })).statusCode, 400, "expired pair code");
});

test("register is rate limited", async () => {
  const instance = await app();
  const codes = [];
  for (let i = 0; i < 6; i++) {
    codes.push((await instance.inject({ method: "POST", url: "/auth/register", payload: { code: "NOPE", name: "spam" } })).statusCode);
  }
  assert.equal(codes.at(-1), 429);
});

test("website logs in with a pair code and a cookie", async () => {
  await db.accessCode.create({ data: { code: "TEST-0004", maxUses: 1, expiresAt: new Date(Date.now() + 60_000) } });
  const { token } = (await post("/auth/register", { code: "TEST-0004", name: "druid" })).json();
  const { code } = (await post("/auth/pair", undefined, token)).json();

  const login = await post("/auth/web", { code });
  assert.equal(login.statusCode, 204);
  const cookie = login.cookies.find((c) => c.name === "tq_session")!;
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Strict");

  const sheet = await (await app()).inject({ url: "/character", cookies: { tq_session: cookie.value } });
  assert.equal(sheet.json().name, "druid");

  await (await app()).inject({ method: "POST", url: "/auth/logout", cookies: { tq_session: cookie.value } });
  assert.equal((await (await app()).inject({ url: "/character", cookies: { tq_session: cookie.value } })).statusCode, 401, "logout ends the session");
});

test("banned players are rejected", async () => {
  await db.accessCode.create({ data: { code: "TEST-0005", maxUses: 1, expiresAt: new Date(Date.now() + 60_000) } });
  const { token } = (await post("/auth/register", { code: "TEST-0005", name: "cheater" })).json();
  const sheet = async () => (await (await app()).inject({ url: "/character", headers: { authorization: `Bearer ${token}` } })).statusCode;
  assert.equal(await sheet(), 200);
  await db.user.updateMany({ where: { character: { name: "cheater" } }, data: { bannedAt: new Date() } });
  assert.equal(await sheet(), 401);
});

test("website registers with an access code and pairs the terminal", async () => {
  await db.accessCode.create({ data: { code: "TEST-0006", maxUses: 1, expiresAt: new Date(Date.now() + 60_000) } });
  assert.equal((await post("/auth/web/register", { code: "WRONG", name: "bard" })).statusCode, 400);

  const res = await post("/auth/web/register", { code: "TEST-0006", name: "bard" });
  assert.equal(res.statusCode, 204);
  const cookie = res.cookies.find((c) => c.name === "tq_session")!;
  assert.equal(cookie.httpOnly, true);
  assert.equal(res.body, "", "the token stays in the cookie");

  const pair = await (await app()).inject({ method: "POST", url: "/auth/pair", cookies: { tq_session: cookie.value } });
  const terminal = await post("/auth/pair/redeem", { code: pair.json().code });
  assert.equal(await characterName(terminal.json().token), "bard");
});
