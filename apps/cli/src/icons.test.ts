import assert from "node:assert/strict";
import { test } from "node:test";
import { beside, draw, itemIcon, monsterIcon } from "./icons.ts";

test("sprites are drawn with half blocks, two pixel rows per line", () => {
  const lines = draw({ rows: ["....", "..a.", "..ab", "...."], colors: { a: "#ff0000", b: "#00ff00" } });
  assert.deepEqual(lines, ["\x1b[38;2;255;0;0;48;2;255;0;0m▀\x1b[0m\x1b[38;2;0;255;0m▄\x1b[0m"], "empty edges are cut");
  assert.equal(draw({ rows: ["..", ".."], colors: {} }).length, 0);
  assert.equal(monsterIcon("dependencyDragon").length, 8, "16 pixels with the outline take 8 lines");
  assert.ok(itemIcon("sword.epic").length > 0);
  assert.deepEqual(itemIcon("nothing.epic"), []);
});

test("text sits next to the icon, or alone without icons", () => {
  assert.deepEqual(beside(["▀▀", "▀▀"], ["one"], true), ["▀▀  one", "▀▀"]);
  assert.deepEqual(beside(["▀▀"], ["one", "two"], true), ["▀▀  one", "    two"]);
  assert.deepEqual(beside(["▀▀"], ["one"], false), ["one"]);
});
