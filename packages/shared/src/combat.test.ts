import assert from "node:assert/strict";
import { test } from "node:test";
import { MONSTERS, fightRewards, rollMonster, winChance } from "./index.ts";

const none = { attack: 0, defense: 0, luck: 0, fortune: 0 };

test("win chance", () => {
  assert.equal(winChance(1, none, "flakyTestGoblin"), 0.5, "an average monster is a coin flip without gear");
  assert.equal(winChance(10, none, "flakyTestGoblin"), 0.5, "monsters level with the player");
  assert.ok(winChance(10, { attack: 5, defense: 27, luck: 0, fortune: 0 }, "flakyTestGoblin") > 0.7, "gear helps");
  assert.ok(winChance(10, none, "dependencyDragon") < 0.3, "dragons are dangerous");
  assert.equal(winChance(10, { ...none, luck: 10 }, "flakyTestGoblin"), 0.6, "luck adds percentage points");
  assert.equal(winChance(30, { attack: 50, defense: 200, luck: 20, fortune: 0 }, "bugSwarm"), 0.95, "never certain");
});

test("monster roll follows weights", () => {
  const total = Object.values(MONSTERS).reduce((s, m) => s + m.weight, 0);
  const steps = 10_000;
  const counts: Record<string, number> = {};
  for (let i = 0; i < steps; i++) {
    const key = rollMonster(() => (i + 0.5) / steps);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  for (const [key, m] of Object.entries(MONSTERS)) assert.equal(counts[key] / steps, m.weight / total, key);
});

test("fight rewards scale with toughness and fortune", () => {
  assert.deepEqual(fightRewards("flakyTestGoblin", 10), { xp: 40, gold: 13 });
  assert.deepEqual(fightRewards("dependencyDragon", 10), { xp: 100, gold: 33 });
  assert.deepEqual(fightRewards("flakyTestGoblin", 10, 100), { xp: 40, gold: 26 });
});
