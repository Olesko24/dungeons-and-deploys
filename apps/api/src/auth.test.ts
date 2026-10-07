import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "./app.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

type Mail = { to: string; subject: string; text: string };
let db: PrismaClient;
const mails: Mail[] = [];
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

const app = () => buildApp({ db, sendMail: async (m) => { mails.push(m); }, publicUrl: "http://test", scheduleResolve: async () => {} });
const register = async (email: string, code?: string) =>
  (await app()).inject({ method: "POST", url: "/auth/register", payload: { email, code } });
const poll = async (loginId: string) => (await app()).inject({ method: "POST", url: "/auth/poll", payload: { loginId } });
const linkToken = () => mails.at(-1)!.text.match(/token=(\S+)/)![1];

async function loginFlow(email: string, code?: string) {
  const res = await register(email, code);
  assert.equal(res.statusCode, 200, res.body);
  const { loginId, confirmCode } = res.json();
  assert.equal((await poll(loginId)).statusCode, 202);

  const page = await (await app()).inject(`/auth/verify?token=${linkToken()}`);
  assert.match(page.body, new RegExp(confirmCode));
  const confirm = await (await app()).inject({
    method: "POST",
    url: "/auth/verify",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: `token=${linkToken()}`,
  });
  assert.equal(confirm.statusCode, 200, confirm.body);

  const done = await poll(loginId);
  assert.equal(done.statusCode, 200);
  assert.equal((await poll(loginId)).statusCode, 404, "token is handed out only once");
  return done.json().token as string;
}

test("access code login flow", async () => {
  await db.accessCode.create({ data: { code: "TEST-0001", maxUses: 1, expiresAt: new Date(Date.now() + 60_000) } });

  assert.equal((await register("a@example.com", "WRONG")).statusCode, 400);

  const token = await loginFlow("A@example.com", "test-0001");
  const me = await (await app()).inject({ url: "/me", headers: { authorization: `Bearer ${token}` } });
  assert.deepEqual(me.json(), { email: "a@example.com" });
  assert.equal((await (await app()).inject({ url: "/me", headers: { authorization: "Bearer nope" } })).statusCode, 401);

  assert.equal((await register("b@example.com", "TEST-0001")).statusCode, 400, "code is used up");
  assert.ok(await loginFlow("a@example.com"), "existing players log in again without a code");
});

test("expired access code is rejected", async () => {
  await db.accessCode.create({ data: { code: "TEST-0002", maxUses: 5, expiresAt: new Date(Date.now() - 1) } });
  assert.equal((await register("c@example.com", "TEST-0002")).statusCode, 400);
});

test("register is rate limited", async () => {
  const instance = await app();
  const codes = [];
  for (let i = 0; i < 6; i++) {
    codes.push((await instance.inject({ method: "POST", url: "/auth/register", payload: { email: "d@example.com" } })).statusCode);
  }
  assert.equal(codes.at(-1), 429);
});
