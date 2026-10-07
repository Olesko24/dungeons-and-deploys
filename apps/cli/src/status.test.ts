import assert from "node:assert/strict";
import { test } from "node:test";
import { shortStatus } from "./status.ts";

const now = new Date("2026-01-01T12:00:00Z").getTime();
const at = (min: number) => new Date(now + min * 60_000).toISOString();
const character = { name: "hero", level: 7, gold: 312 };
const quest = { endsAt: at(23), presentSlots: 4, totalSlots: 9, resolved: false };

test("short status", () => {
  assert.equal(shortStatus({ quest, readyAt: at(38), character }, now), "⚔ Quest 23m · ■■■■□□□□□ · Lv 7 · 312g");
  assert.equal(shortStatus({ quest: { ...quest, endsAt: at(-1) }, readyAt: at(14), character }, now), "⚔ Quest done · ■■■■□□□□□ · Lv 7 · 312g");
  assert.equal(shortStatus({ quest: { ...quest, resolved: true }, readyAt: at(7), character }, now), "Resting 7m · Lv 7 · 312g");
  assert.equal(shortStatus({ quest: null, readyAt: at(0), character }, now), "Quest ready · Lv 7 · 312g");
});
