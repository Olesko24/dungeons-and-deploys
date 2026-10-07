import assert from "node:assert/strict";
import { test } from "node:test";
import { bossLoot, stageChance, stageRewards } from "./index.ts";

const none = { attack: 0, defense: 0, luck: 0, fortune: 0 };
const rare = { attack: 5, defense: 27, luck: 4, fortune: 0 };
const party = (size: number, gear = rare) => Array.from({ length: size }, () => ({ level: 10, gear }));

test("stage chance", () => {
  assert.ok(stageChance(0, party(1)) > stageChance(0, party(1, none)), "gear helps");
  assert.ok(stageChance(0, party(5)) > stageChance(0, party(1)), "a full party beats a solo run");
  assert.ok(stageChance(3, party(1)) < stageChance(0, party(1)), "the boss is the hardest stage");
  assert.ok(stageChance(3, party(1, none)) > 0.05 && stageChance(0, party(5)) <= 0.95, "always within 5-95%");
});

test("stage rewards grow with the party", () => {
  assert.deepEqual(stageRewards(0, 10, 1), { xp: 60, gold: 20 });
  assert.deepEqual(stageRewards(0, 10, 5), { xp: 84, gold: 28 });
});

test("boss loot", () => {
  assert.equal(bossLoot(10, 1, () => 0), "helm.common");
  assert.equal(bossLoot(10, 5, (() => { const v = [0, 0.1, 0.1, 0.99]; return () => v.shift() ?? 0; })()), "helm.legendary", "5 members roll rarity 3 times");
});
