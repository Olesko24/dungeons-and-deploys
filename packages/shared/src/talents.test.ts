import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_LEVEL,
  TALENTS,
  TALENT_KEYS,
  TALENT_TREES,
  learnError,
  levelFromXp,
  playerBonus,
  rollLoot,
  talentBonus,
  talentText,
} from "./index.ts";

test("every tree holds 36 ranks, more than the 100 points at the cap", () => {
  for (const tree of TALENT_TREES) {
    assert.equal(Object.values(TALENTS).filter((t) => t.tree === tree).reduce((s, t) => s + t.max, 0), 36, tree);
  }
  assert.equal(levelFromXp(1e12).level, MAX_LEVEL);
});

test("tiles do not overlap and arrows point to the tile right above", () => {
  const cells = new Set(TALENT_KEYS.map((k) => `${TALENTS[k].tree}:${TALENTS[k].row}:${TALENTS[k].col}`));
  assert.equal(cells.size, TALENT_KEYS.length);
  for (const t of Object.values(TALENTS)) {
    if (!("requires" in t)) continue;
    const parent = TALENTS[t.requires];
    assert.deepEqual([parent.tree, parent.row + 1, parent.col], [t.tree, t.row, t.col], t.name);
  }
});

test("rows open with points in the same tree, arrows need the parent maxed", () => {
  assert.equal(learnError({ sharpSyntax: 4 }, "hotPath", 50), "needs 5 points in offense");
  assert.equal(learnError({ sharpSyntax: 5 }, "hotPath", 50), null);
  assert.equal(learnError({ sharpSyntax: 5, quickFix: 5, hotPath: 4 }, "overclock", 50), "needs Hot Path maxed");
  assert.equal(learnError({ sharpSyntax: 5, quickFix: 5, hotPath: 5 }, "overclock", 50), null);
  assert.equal(learnError({ luckyGuess: 10, sharpSyntax: 5 }, "bossSlayer", 50), "needs 10 points in offense");
  assert.equal(learnError({ sharpSyntax: 5 }, "sharpSyntax", 50), "talent maxed");
  assert.equal(learnError({ sharpSyntax: 3 }, "haggler", 3), "no talent points left");
});

test("talent text and bonus", () => {
  assert.equal(talentText("hotPath", 2), "+4% raid damage");
  assert.equal(talentText("hotPath", 0), null);
  assert.equal(talentText("tenX", 2), null, "beyond the max");
  const bonus = talentBonus({ sharpSyntax: 5, overclock: 5, tenX: 1, haggler: 3 });
  assert.deepEqual([bonus.power, bonus.fortune, bonus.xp], [25, 6, 0]);
  const { gear } = playerBonus([{ attack: 2, defense: 0, luck: 3, fortune: 5 }], { luckyGuess: 4, haggler: 1 });
  assert.deepEqual(gear, { attack: 2, defense: 0, luck: 7, fortune: 7 });
});

test("drop chance and extra rarity rolls improve loot", () => {
  const dice = (...v: number[]) => () => v.shift() ?? 0;
  assert.equal(rollLoot(5, 1, dice(0.45)), null);
  assert.notEqual(rollLoot(5, 1, dice(0.45), { drop: 10, rarityRoll: 0 }), null, "+10 points drop chance");
  assert.equal(rollLoot(5, 1, dice(0, 0, 0.1)), "helm.common");
  assert.equal(rollLoot(5, 1, dice(0, 0.1, 0, 0.1, 0.99), { drop: 0, rarityRoll: 20 }), "helm.epic", "the extra roll counts");
});
