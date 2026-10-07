import assert from "node:assert/strict";
import { test } from "node:test";
import { shopDay, shopOffers } from "./index.ts";

test("daily shop offers", () => {
  const today = shopOffers("2026-10-07");
  assert.deepEqual(shopOffers("2026-10-07"), today, "the same for everyone on a day");
  assert.notDeepEqual(shopOffers("2026-10-08"), today, "a new day, new offers");
  assert.deepEqual(today.map((o) => o.key.split(".")[1]), ["uncommon", "epic", "mythic"]);
  assert.equal(shopDay(new Date("2026-10-07T23:59:59Z")), "2026-10-07");
  const bases = new Set(Array.from({ length: 60 }, (_, i) => shopOffers(`2026-11-${String((i % 30) + 1).padStart(2, "0")}`)[0].key));
  assert.ok(bases.size > 10, "offers vary across days");
});
