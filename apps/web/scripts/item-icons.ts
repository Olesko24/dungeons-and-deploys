// Generates 16x16 pixel-art SVG icons for every item in the catalog: node scripts/item-icons.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { ITEM_BASES, RARITIES, type Rarity } from "@tokenquest/shared";

// Material shades per rarity, derived from the rarity colors in docs/style.md.
const MATERIAL: Record<Rarity, { l: string; m: string; d: string }> = {
  common: { l: "#e4e8ee", m: "#b8bec8", d: "#7a808a" },
  rare: { l: "#b8d8ff", m: "#6aa8f0", d: "#3a6ab0" },
  epic: { l: "#dccbff", m: "#b48cff", d: "#7a52c8" },
  legendary: { l: "#ffe0a8", m: "#ffb45c", d: "#c47a2a" },
};
const FIXED: Record<string, string> = { o: "#06050b", h: "#8a5a3a", H: "#5a3a24", e: "#e86a56", w: "#eee7d8" };

/** Builds a symmetric sprite from left halves. The mirrored side turns light pixels dark. */
const pad = (rows: string[]) => [...rows, ...Array(16 - rows.length).fill(".".repeat(16))];

const sym = (halves: string[]) =>
  pad(halves.map((h) => h + h.split("").reverse().map((c) => (c === "l" ? "d" : c)).join("")));

// Legend: l/m/d material light/mid/dark, h/H wood, e gem, w highlight, o outline. Outlines are added automatically.
const SPRITES: Record<string, string[]> = {
  helm: sym([
    "........", "........", "........", "......ll", "....lllm", "...llmmm", "...lmmmm", "...mmmmm",
    "...ddddd", "...md...", "...md...", "...md...",
  ]),
  chest: sym([
    "........", "..mmm...", ".llmmm..", ".lmmmmmm", ".lmmmmmm", ".mmmmmmm", "..m.mmmm", "....mmmm",
    "....lmmm", "....mmmm", "....ddde", "....mmmm", "....mmmm",
  ]),
  legs: sym([
    "........", "........", "....dddd", "....lmme", "....lmmm", "....lmmm", "....lmm.", "....lmm.",
    "....lmm.", "....lmm.", "....lmm.", "....ddd.",
  ]),
  gloves: pad([
    "................", "................", ".....l.m.m.m....", ".....l.m.m.m....", ".....lmmmmmm.m..",
    ".....lmmmmmm.m..", ".....lmmmmmmmd..", ".....lmmmmmmd...", ".....lmmmmmd....", "......mmmmd.....",
    ".....dddddd.....", ".....lmmmmd.....", ".....dddddd.....",
  ]),
  boots: pad([
    "................", "................", "................", ".....lmmm.......", ".....lmmm.......",
    ".....dddd.......", ".....lmmm.......", ".....lmmm.......", ".....lmmmmmm....", ".....lmmmmmmmd..",
    ".....lmmmmmmmd..", ".....HHHHHHHHH..",
  ]),
  sword: pad([
    "................", "................", ".............w..", "............wl..", "...........wlm..",
    "..........wlm...", ".........wlm....", "........wlm.....", "...d...wlm......", "....d.wlm.......",
    ".....dlm........", "....hHdd........", "...hH...d.......", "..hH............", ".d..............",
  ]),
  shield: sym([
    "........", "........", "..llllll", "..lmmmmm", "..lmmmmm", "..lmmmmm", "..lmmmme", "..lmmmme",
    "...lmmmm", "...lmmmm", "....lmmm", ".....lmm", "......lm", ".......l",
  ]),
  greatsword: pad([
    "...........www..", "..........wlmd..", ".........wlmd...", "........wlmd....", ".......wlmd.....",
    "......wlmd......", ".....wlmd.......", "....wlmd........", "..ddlmd.........", "...ddd..........",
    "...hHdd.........", "..hH..d.........", ".hH.............", "dd..............",
  ]),
  axe: pad([
    "................", "................", "......dd........", "......hH.lm.....", "......hHlmmd....",
    "......hlmmmd....", "......hHlmd.....", "......hH.d......", "......hH........", "......hH........",
    "......hH........", "......dd........",
  ]),
  battleAxe: sym([
    "........", ".......d", "...ml..h", "..mmml.h", ".mmmmmlh", ".mmmmmlh", "..mmml.h", "...ml..h",
    ".......h", ".......h", ".......h", ".......h", ".......h", ".......d",
  ]),
  dagger: pad([
    "................", "................", "................", "................", "..........w.....",
    ".........wl.....", "........wlm.....", ".......wlm......", "......wlm.......", "...d.wlm........",
    "....dlm.........", "....hdd.........", "...hH..d........", "..dd............",
  ]),
  mace: sym([
    "........", "........", "......ll", ".....lmm", "....lmmm", "....lmmm", ".....mmm", "......dd",
    ".......h", ".......h", ".......h", ".......h", ".......h", "......dd",
  ]),
  morningStar: sym([
    "........", ".......w", "....w.ll", ".....lmm", "...wlmmm", "....lmmm", ".....mmm", "....w.dd",
    ".......h", ".......h", ".......h", ".......h", ".......h", "......dd",
  ]),
  scythe: pad([
    "................", "...llmmmmmhH....", "..lmmmdd..hH....", ".lmd......hH....", ".md.......hH....",
    "..........hH....", "..........hH....", "..........hH....", "..........hH....", "..........hH....",
    "..........hH....", "..........hH....", "..........hH....", "..........hH....", "..........dd....",
  ]),
  spear: sym([
    "........", ".......w", "......wl", "......lm", "......lm", "......lm", "......dd", ".......h",
    ".......h", ".......h", ".......h", ".......h", ".......h", ".......h", ".......d",
  ]),
  bow: pad([
    "................", ".........lm.....", "........lm.w....", ".......lm..w....", "......lm...w....",
    "......lm...w....", ".....lm....w....", ".....hH....w....", ".....hH....w....", ".....lm....w....",
    "......lm...w....", "......lm...w....", ".......lm..w....", "........lm.w....", ".........lm.....",
  ]),
  crossbow: sym([
    "........", "........", ".lmmmmmh", "l.w....h", "...w...h", "....w..h", ".....w.h", "......wh",
    ".......h", "......hh", "......hh", "......hh", "......dd",
  ]),
  staff: pad([
    "..........mm....", ".........lwmd...", ".........lmmd...", "..........dd....", ".........hH.....",
    "........hH......", ".......hH.......", "......hH........", ".....hH.........", "....hH..........",
    "...hH...........", "..hH............", ".hH.............",
  ]),
  ring: sym([
    "........", "........", "......ee", "......ee", ".....lmm", "....lm..", "...lm...", "...m....",
    "...m....", "...m....", "...mm...", "....mm..", ".....mmm",
  ]),
  necklace: sym([
    "........", "..m.....", "..m.....", "...m....", "...m....", "....m...", ".....m..", "......mm",
    "......ll", ".....lee", ".....lee", "......ll",
  ]),
  earrings: sym([
    "........", "........", "...m....", "..m.m...", "..m.m...", "...m....", "...l....", "..lle...",
    "..lee...", "..eee...", "...e....",
  ]),
};

function svg(rows: string[], rarity: Rarity) {
  const colors: Record<string, string> = { ...FIXED, ...MATERIAL[rarity] };
  const grid = rows.map((r) => r.split(""));
  const filled = (x: number, y: number) => grid[y]?.[x] !== undefined && grid[y][x] !== "." && grid[y][x] !== "o";
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (grid[y][x] !== ".") continue;
      if ([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => filled(x + dx, y + dy)))) grid[y][x] = "o";
    }
  }
  const rects: string[] = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < 16; ) {
      const c = row[x];
      let w = 1;
      while (row[x + w] === c) w++;
      if (c !== ".") rects.push(`<rect x="${x}" y="${y}" width="${w}" height="1" fill="${colors[c]}"/>`);
      x += w;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="64" height="64" shape-rendering="crispEdges">\n${rects.join("\n")}\n</svg>\n`;
}

const out = new URL("../public/items/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const base of ITEM_BASES) {
  const rows = SPRITES[base];
  if (!rows || rows.length !== 16 || rows.some((r) => r.length !== 16)) throw new Error(`${base}: sprite must be 16x16`);
  for (const rarity of RARITIES) writeFileSync(new URL(`${base}.${rarity}.svg`, out), svg(rows, rarity));
}
console.log(`Wrote ${ITEM_BASES.length * RARITIES.length} icons to ${out.pathname}`);
