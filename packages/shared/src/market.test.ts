import assert from "node:assert/strict";
import { test } from "node:test";
import { marketValue, priceTag, rollQuality, rollStats, scrapValue, sellerPayout } from "./index.ts";

const none = { attack: 0, defense: 0, luck: 0, fortune: 0 };

test("roll quality spans 0 to 1 within a rarity", () => {
  assert.equal(rollQuality("helm.rare", { ...none, defense: 3 }), 0);
  assert.equal(rollQuality("helm.rare", { ...none, defense: 6 }), 1);
  // Weapon attack is measured before the kind's multiplier: a battle axe (2 hands, x1.25) at 15 attack rolled the top of 3-6.
  assert.equal(rollQuality("battleAxe.rare", { ...none, attack: 15 }), 1);
  for (const r of [0, 0.5, 0.99]) {
    const q = rollQuality("scythe.mythic", rollStats("scythe.mythic", () => r));
    assert.ok(q >= 0 && q <= 1, `quality ${q} out of range`);
  }
});

test("market value scales the rarity price by the roll", () => {
  assert.equal(marketValue("helm.epic", { ...none, defense: 6 }), 90, "weakest epic roll: 75% of 120");
  assert.equal(marketValue("helm.epic", { ...none, defense: 10 }), 150, "best epic roll: 125% of 120");
});

test("price tags and payout", () => {
  assert.deepEqual([priceTag(80, 100), priceTag(85, 100), priceTag(115, 100), priceTag(116, 100)], ["loot", "fair", "fair", "ripoff"]);
  assert.equal(sellerPayout(120), 108);
  assert.equal(sellerPayout(9), 8);
});

test("scrapping pays a quarter of the value, at least 1 gold", () => {
  assert.equal(scrapValue("helm.epic", { ...none, defense: 10 }), 37);
  assert.equal(scrapValue("helm.common", { ...none, defense: 1 }), 3);
});
