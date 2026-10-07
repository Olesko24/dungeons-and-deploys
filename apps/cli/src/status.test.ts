import assert from "node:assert/strict";
import { test } from "node:test";
import { inventoryLines, rarityColor, shortStatus, statsText } from "./status.ts";

const now = new Date("2026-01-01T12:00:00Z").getTime();
const at = (min: number) => new Date(now + min * 60_000).toISOString();
const character = { name: "hero", level: 7, gold: 312 };
const quest = { startedAt: at(-22), endsAt: at(23), resolved: false };

test("short status", () => {
  assert.equal(shortStatus({ quest, readyAt: at(38), character }, now), "⚔ Quest 23m · ■■■■□□□□□ · Lv 7 · 312g");
  assert.equal(shortStatus({ quest: { ...quest, endsAt: at(-1) }, readyAt: at(14), character }, now), "⚔ Quest done · ■■■■■■■■■ · Lv 7 · 312g");
  assert.equal(shortStatus({ quest: { ...quest, resolved: true }, readyAt: at(7), character }, now), "Resting 7m · Lv 7 · 312g");
  assert.equal(shortStatus({ quest: null, readyAt: at(0), character }, now), "Quest ready · Lv 7 · 312g");
  const dungeon = { code: "K7Q2PA", state: "running", startsAt: at(-20), cleared: 1, stageEndsAt: at(10) };
  assert.equal(shortStatus({ quest, readyAt: at(38), character, dungeon }, now), "Dungeon 2/4 · 10m · Lv 7 · 312g");
  const encounter = { name: "Bug Swarm", expiresAt: at(4), winChance: 0.6 };
  assert.equal(shortStatus({ quest, readyAt: at(38), character, encounter }, now), "⚠ Bug Swarm! quest fight · 4m · Lv 7 · 312g");
  assert.equal(shortStatus({ quest, readyAt: at(38), character, encounter: { ...encounter, expiresAt: at(-1) } }, now), "⚔ Quest 23m · ■■■■□□□□□ · Lv 7 · 312g");
});

test("inventory lines", () => {
  const items = [
    { id: 3, name: "Slaughterer's Iron Helm", rarity: "rare", stats: { attack: 2, defense: 5, luck: 0, fortune: 0 }, equippedSlot: "head" },
    { id: 7, name: "Copper Ring", rarity: "common", stats: { attack: 0, defense: 0, luck: 1, fortune: 0 }, equippedSlot: null },
  ];
  const lines = inventoryLines(items, { attack: 2, defense: 5, luck: 0, fortune: 0 }, (t) => t);
  assert.equal(lines[0], "Equipped · ATK 2 · DEF 5");
  assert.match(lines[1], /^ {2}head {6}#3 {4}Slaughterer's Iron Helm +rare +ATK 2 · DEF 5$/);
  assert.match(lines.at(-1)!, /#7 +Copper Ring +common +LCK \+1$/);
  assert.equal(statsText({ attack: 0, defense: 0, luck: 0, fortune: 12 }), "FOR +12%");
  assert.equal(rarityColor("x", "epic", true), "\x1b[38;2;180;140;255mx\x1b[0m");
  assert.equal(rarityColor("x", "epic", false), "x");
});
