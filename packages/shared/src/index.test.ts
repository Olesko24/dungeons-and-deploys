import assert from "node:assert/strict";
import { test } from "node:test";
import { levelFromXp, questOutcome, xpToNext } from "./index.ts";

test("level curve", () => {
  assert.equal(xpToNext(1), 100);
  assert.equal(xpToNext(4), 800);
  assert.deepEqual(levelFromXp(0), { level: 1, xpIntoLevel: 0, xpForNext: 100 });
  assert.deepEqual(levelFromXp(100), { level: 2, xpIntoLevel: 0, xpForNext: 283 });
  assert.deepEqual(levelFromXp(400), { level: 3, xpIntoLevel: 17, xpForNext: 520 });
});

test("quest outcome", () => {
  assert.deepEqual(questOutcome(() => 0, 1), { success: true, xp: 70, gold: 14 });
  assert.deepEqual(questOutcome(() => 0, 50), { success: true, xp: 560, gold: 63 }, "rewards grow with the level");
  assert.deepEqual(questOutcome(() => 0.75, 1), { success: false, xp: 10, gold: 0 }, "75% base chance");
  assert.equal(questOutcome(() => 0.8, 1, 10).success, true, "10 luck adds about 7 points");
  assert.equal(questOutcome(() => 0.92, 1, 50).success, false, "luck diminishes: 50 luck adds under 17 points");
  assert.equal(questOutcome(() => 0.8, 1, 0, 0, 10).success, true, "quest luck adds percentage points");
  assert.equal(questOutcome(() => 0.95, 1, 1000, 0, 50).success, false, "capped at 95%");
});
