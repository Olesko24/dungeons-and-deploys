import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.ts";

test("GET /health returns ok when the database answers", async () => {
  const app = buildApp({ $queryRaw: async () => [] });
  const res = await app.inject("/health");
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "ok");
});

test("GET /health returns 503 when the database is down", async () => {
  const app = buildApp({ $queryRaw: async () => { throw new Error("down"); } });
  const res = await app.inject("/health");
  assert.equal(res.statusCode, 503);
});
