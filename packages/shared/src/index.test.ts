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
  assert.deepEqual(questOutcome(() => 0), { success: true, xp: 70, gold: 14 });
  assert.deepEqual(questOutcome(() => 0.75), { success: false, xp: 10, gold: 0 }, "75% base chance");
  assert.equal(questOutcome(() => 0.8, 10).success, true, "luck adds percentage points");
  assert.equal(questOutcome(() => 0.95, 50).success, false, "capped at 95%");
});
