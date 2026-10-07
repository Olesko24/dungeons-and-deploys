import assert from "node:assert/strict";
import { test } from "node:test";
import { countSlots, levelFromXp, questOutcome, xpToNext } from "./index.ts";

test("level curve", () => {
  assert.equal(xpToNext(1), 100);
  assert.equal(xpToNext(4), 800);
  assert.deepEqual(levelFromXp(0), { level: 1, xpIntoLevel: 0, xpForNext: 100 });
  assert.deepEqual(levelFromXp(100), { level: 2, xpIntoLevel: 0, xpForNext: 283 });
  assert.deepEqual(levelFromXp(400), { level: 3, xpIntoLevel: 17, xpForNext: 520 });
});

test("slot bitmask", () => {
  assert.equal(countSlots(0b110111011), 7);
  assert.equal(countSlots(0), 0);
});

test("quest outcome", () => {
  assert.deepEqual(questOutcome(4, () => 0), { success: false, xp: 8, gold: 0 });
  assert.deepEqual(questOutcome(5, () => 0.59), { success: true, xp: 50, gold: 13 });
  assert.equal(questOutcome(5, () => 0.6).success, false);
  assert.equal(questOutcome(9, () => 0.94).success, true);
  assert.equal(questOutcome(9, () => 0.95).success, false);
});
