import assert from "node:assert/strict";
import { test } from "node:test";
import { RAID_TICKS, raidBossHp, raidDamage, raidPhase } from "./index.ts";

test("boss HP grows with raiders and, damped, with their gear", () => {
  assert.equal(raidBossHp([{ power: 100, base: 100 }]), 100 * RAID_TICKS);
  assert.equal(raidBossHp(Array(5).fill({ power: 100, base: 100 })), 500 * RAID_TICKS);
  const geared = raidBossHp([{ power: 300, base: 100 }]);
  assert.ok(geared > 100 * RAID_TICKS && geared < 300 * RAID_TICKS, "gear raises HP less than damage");
});

test("boss phase and damage", () => {
  assert.equal(raidPhase(() => 0), 0.6);
  assert.equal(raidPhase(() => 0.5), 1);
  assert.equal(raidDamage(100, 1, () => 0.5), 100);
  assert.equal(raidDamage(100, 0.6, () => 0), 48);
});
