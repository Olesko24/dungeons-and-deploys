import assert from "node:assert/strict";
import { test } from "node:test";
import { equipPlan, equipmentBonus, item, itemName, questOutcome, rollLoot, rollRarity, rollStats } from "./index.ts";

/** Returns the given values in order, like a loaded die. */
const dice = (...values: number[]) => () => values.shift() ?? 0;

test("item catalog", () => {
  assert.deepEqual(item("scythe.legendary"), {
    key: "scythe.legendary", type: "twoHanded", rarity: "legendary", baseName: "Reaper of Zombie Processes", primary: "attack", signature: "luck",
  });
  assert.equal(item("dagger.epic").baseName, "Runed Dagger");
  assert.equal(item("morningStar.common").type, "weapon");
  assert.throws(() => item("twoHanded.common"), "weapons are keyed by kind");
  assert.equal(item("ring.epic").primary, "luck");
  assert.throws(() => item("hat.common"));
});

test("rolled stats", () => {
  assert.deepEqual(rollStats("helm.common", () => 0.99), { attack: 0, defense: 3, luck: 0, fortune: 0 }, "common has no bonus");
  assert.deepEqual(rollStats("greatsword.common", () => 0.99), { attack: 6, defense: 0, luck: 0, fortune: 0 }, "two-hander doubles attack");
  assert.deepEqual(rollStats("battleAxe.common", () => 0.99), { attack: 8, defense: 0, luck: 0, fortune: 0 }, "battle axe hits harder");
  assert.deepEqual(rollStats("dagger.common", () => 0.99), { attack: 2, defense: 0, luck: 2, fortune: 0 }, "dagger trades attack for luck, even when common");
  // Primary roll, then pick from [attack, luck, fortune] and roll its value.
  assert.deepEqual(rollStats("helm.rare", dice(0, 0, 0.99)), { attack: 3, defense: 3, luck: 0, fortune: 0 });
  assert.deepEqual(rollStats("sword.legendary", () => 0), { attack: 10, defense: 5, luck: 3, fortune: 8 }, "legendary gets all three other stats");
  assert.deepEqual(rollStats("spear.legendary", () => 0), { attack: 18, defense: 5, luck: 3, fortune: 8 }, "signature takes one bonus spot");
});

test("name prefix follows the strongest bonus stat", () => {
  assert.equal(itemName("helm.common", { attack: 0, defense: 2, luck: 0, fortune: 0 }), "Leather Cap");
  assert.equal(itemName("helm.rare", { attack: 3, defense: 4, luck: 0, fortune: 0 }), "Slaughterer's Iron Helm");
  assert.equal(itemName("sword.epic", { attack: 8, defense: 3, luck: 3, fortune: 0 }), "Gambler's Runed Sword", "3/3 luck beats 3/5 defense");
  assert.equal(itemName("bow.rare", { attack: 4, defense: 1, luck: 2, fortune: 0 }), "Defender's Fine Bow", "signature luck does not name the bow");
  assert.equal(itemName("ring.rare", { attack: 0, defense: 0, luck: 2, fortune: 5 }), "Merchant's Silver Ring");
  assert.equal(itemName("chest.rare", { attack: 0, defense: 4, luck: 0, fortune: 0 }), "Chainmail", "no bonus, no prefix");
});

test("equipment bonus sums all stats", () => {
  assert.deepEqual(
    equipmentBonus([{ attack: 3, defense: 0, luck: 1, fortune: 0 }, { attack: 0, defense: 5, luck: 2, fortune: 10 }]),
    { attack: 3, defense: 5, luck: 3, fortune: 10 },
  );
});

test("rarity depends on level", () => {
  assert.equal(rollRarity(1, 1, () => 0.999), "rare", "level 1 never rolls epic or legendary");
  assert.equal(rollRarity(2, 1, () => 0.9995), "legendary", "level 2 has a 0.1% legendary chance");
  assert.equal(rollRarity(2, 1, () => 0.998), "epic");
  assert.equal(rollRarity(10, 1, () => 0.5), "common");
  assert.equal(rollRarity(10, 1, () => 0.985), "legendary");
  assert.equal(rollRarity(10, 3, dice(0.1, 0.99, 0.5)), "legendary", "best of several rolls");
});

test("loot roll", () => {
  assert.equal(rollLoot(5, 1, dice(0.4)), null, "40% drop chance");
  assert.equal(rollLoot(5, 1, dice(0.39, 0, 0.1)), "helm.common");
  assert.equal(rollLoot(5, 3, dice(0, 0.999, 0.1, 0.1, 0.99)), "earrings.epic", "the best of several rarity rolls counts");
  assert.equal(rollLoot(5, 1, dice(0, 7 / 11, 0.99, 0.1)), "crossbow.common", "two-handed type picks a two-handed kind");
  assert.equal(rollLoot(5, 1, dice(0, 5 / 11, 0, 0.1)), "dagger.common", "weapon type picks a one-handed kind");
});

test("equipment changes quest odds and gold", () => {
  assert.equal(questOutcome(() => 0.8).success, false);
  assert.equal(questOutcome(() => 0.8, 10).success, true, "luck +10 lifts 75% to 85%");
  assert.equal(questOutcome(() => 0, 0, 100).gold, 28, "fortune +100% doubles gold");
});

test("equip plan", () => {
  const sword = { id: 1, key: "sword.common", slot: "mainHand" as const };
  const shield = { id: 2, key: "shield.common", slot: "offHand" as const };
  const axe = { id: 3, key: "battleAxe.common", slot: "mainHand" as const };
  const ring = { id: 4, key: "ring.common", slot: "ring1" as const };

  assert.deepEqual(equipPlan([], "helm.rare"), { slot: "head", unequip: [] });
  assert.deepEqual(equipPlan([sword, shield], "bow.rare"), { slot: "mainHand", unequip: [1, 2] });
  assert.deepEqual(equipPlan([axe], "shield.rare"), { slot: "offHand", unequip: [3] });
  assert.deepEqual(equipPlan([axe], "mace.rare"), { slot: "mainHand", unequip: [3] });
  assert.deepEqual(equipPlan([ring], "ring.rare"), { slot: "ring2", unequip: [] });
  assert.deepEqual(equipPlan([ring, { ...ring, id: 5, slot: "ring2" }], "ring.rare"), { slot: "ring1", unequip: [4] });
  assert.deepEqual(equipPlan([ring, { ...ring, id: 5, slot: "ring2" }], "ring.rare", "ring2"), { slot: "ring2", unequip: [5] });
});

test("rarity distribution matches the weights", () => {
  const steps = 100_000;
  for (const [level, expected] of [[1, [90, 10, 0, 0]], [2, [89.4, 10, 0.5, 0.1]], [10, [59, 30, 9, 2]], [30, [40, 35, 19, 6]]] as const) {
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (let i = 0; i < steps; i++) counts[rollRarity(level, 1, () => (i + 0.5) / steps)]++;
    assert.deepEqual(Object.values(counts).map((c) => (c / steps) * 100), expected, `level ${level}`);
  }
});
