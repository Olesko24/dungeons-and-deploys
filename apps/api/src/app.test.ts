import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildApp } from "./app.ts";
import { PrismaClient } from "./generated/prisma/client.ts";
import { testDb } from "./testing.ts";

const deps = { scheduleResolve: async () => {} };
let db: PrismaClient;
before(async () => { db = await testDb(); });
after(() => db.$disconnect());

test("GET /health returns ok when the database answers", async () => {
  const app = await buildApp({ db, ...deps });
  const res = await app.inject("/health");
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "ok");
});

test("GET /health returns 503 when the database is down", async () => {
  const down = new PrismaClient({ adapter: new PrismaPg({ connectionString: "postgresql://x:x@localhost:1/x" }) });
  const app = await buildApp({ db: down, ...deps });
  const res = await app.inject("/health");
  assert.equal(res.statusCode, 503);
});
