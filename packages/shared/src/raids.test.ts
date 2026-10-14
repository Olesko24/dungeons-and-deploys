import assert from "node:assert/strict";
import { test } from "node:test";
import { RAID_BOSSES, RAID_TICKS, raidBossHp, raidDamage, raidLoot, raidPhase, raidRewards } from "./index.ts";

test("bosses get harder and pay better", () => {
  for (let i = 1; i < RAID_BOSSES.length; i++) {
    const [prev, boss] = [RAID_BOSSES[i - 1], RAID_BOSSES[i]];
    assert.ok(boss.power > prev.power && boss.rolls > prev.rolls && boss.reward > prev.reward, boss.name);
  }
});

test("boss HP follows the boss and the number of raiders, not their gear", () => {
  assert.equal(raidBossHp(0, 5), Math.round((0.97 * 250 * 5 * RAID_TICKS) / 10));
  assert.ok(Math.abs(raidBossHp(0, 10) - 2 * raidBossHp(0, 5)) <= 1, "twice the raiders, twice the HP");
  assert.ok(raidBossHp(1, 5) > raidBossHp(0, 5));
});

test("boss phase and damage", () => {
  assert.equal(raidPhase(() => 0), 0.6);
  assert.equal(raidPhase(() => 0.5), 1);
  assert.equal(raidDamage(100, 1, () => 0.5), 100);
  assert.equal(raidDamage(100, 0.6, () => 0), 48);
});

test("rewards and loot scale with the boss", () => {
  assert.deepEqual(raidRewards(10, 0), { xp: 200, gold: 70 });
  assert.deepEqual(raidRewards(10, 5), { xp: 1200, gold: 420 });
  // The last roll is the best rarity on the raider's loot table: harder bosses roll more often.
  const rolls = (n: number) => { const v = [0, ...Array(n - 1).fill(0.1), 0.99]; return () => v.shift() ?? 0; };
  assert.equal(raidLoot(30, 5, rolls(8)), "helm.mythic");
  assert.equal(raidLoot(90, RAID_BOSSES.length - 1, rolls(12)), "helm.celestial");
  assert.equal(raidLoot(1, RAID_BOSSES.length - 1, rolls(12)), "helm.uncommon", "loot follows the raider's level, carried low levels stay low");
});
