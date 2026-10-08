// Generates 16x16 pixel-art SVG icons for every item, talent, monster, raid boss, guild buff, achievement and the UI:
// node scripts/item-icons.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { ACHIEVEMENTS, GUILD_BUFFS, ITEM_BASES, MONSTERS, RAID_BOSSES, RARITIES, type Rarity, TALENTS, type TalentTree } from "@dnd/shared";

// Material shades per rarity, derived from the rarity colors in docs/style.md.
const MATERIAL: Record<Rarity, { l: string; m: string; d: string }> = {
  common: { l: "#e4e8ee", m: "#b8bec8", d: "#7a808a" },
  uncommon: { l: "#c4f0b8", m: "#7cd47c", d: "#3e8a44" },
  rare: { l: "#b8d8ff", m: "#6aa8f0", d: "#3a6ab0" },
  epic: { l: "#dccbff", m: "#b48cff", d: "#7a52c8" },
  legendary: { l: "#ffe0a8", m: "#ffb45c", d: "#c47a2a" },
  mythic: { l: "#ffc0cc", m: "#ff6b8a", d: "#b8304e" },
  ancient: { l: "#a8f4ea", m: "#3fd0c0", d: "#1e8a80" },
  divine: { l: "#fffad0", m: "#fff07a", d: "#c8b030" },
  celestial: { l: "#ffd0ff", m: "#f070ff", d: "#a83ab8" },
  eternal: { l: "#ffffff", m: "#f4f2ff", d: "#a8a0d0" },
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

type Material = { l: string; m: string; d: string };

function svg(rows: string[], material: Material) {
  const colors: Record<string, string> = { ...FIXED, ...material };
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
  for (const rarity of RARITIES) writeFileSync(new URL(`${base}.${rarity}.svg`, out), svg(rows, MATERIAL[rarity]));
}
console.log(`Wrote ${ITEM_BASES.length * RARITIES.length} icons to ${out.pathname}`);

const GOLD = { l: "#ffe0a8", m: "#f0c05a", d: "#a8843c" };
const LEATHER = { l: "#c8955a", m: "#8a5a3a", d: "#5a3a24" };
const BONE = { l: "#f8f2e2", m: "#e4d8bc", d: "#a89878" };
const PARCHMENT = { l: "#f8f0dc", m: "#e4d2a6", d: "#a8843c" };

const UI_SPRITES: Record<string, [string[], Material]> = {
  gold: [sym(["........", "........", "........", "......ll", "....llmm", "...lmmdd", "..lmmdmm", "..lmdmmw", "..lmdmmm", "..lmmdmm", "...lmmdd", "....lmmm", "......mm"]), GOLD],
  bag: [sym(["........", "........", "....m...", ".....m.m", "......dd", ".....lmm", "....lmmm", "...lmmmm", "..lmmmmm", "..lmmmmm", "..lmmmmm", "..lmmmmm", "...mmmmm", "....dddd"]), LEATHER],
  hourglass: [sym(["........", "..HHHHHH", "...w....", "...wmmmm", "....wmmm", ".....wmm", "......wm", ".......w", ".......w", "......w.", ".....w..", "....w..m", "...w.mmm", "...wmmmm", "..HHHHHH"]), GOLD],
  equipment: [SPRITES.chest, MATERIAL.common],
  guild: [pad(["................", "..H.............", "..Hmmmmmmmm.....", "..Hmmmmmmmm.....", "..Hmmwwmmmm.....", "..Hmwwwwmmm.....", "..Hmmwwmmmm.....", "..Hmmmmmmmm.....", "..Hmmmm.mmm.....", "..Hmmm...mm.....", "..H.............", "..H.............", "..H.............", "..H.............", "..HH............"]), MATERIAL.rare],
  raid: [sym(["........", "........", "....llll", "...lmmmm", "..lmmmmm", "..lmmmmm", "..lm..mm", "..lm..mm", "..lmmmmm", "...lmm.m", "....lmmm", "....m.m.", "....mmmm"]), BONE],
  scroll: [pad(["................", "................", "..mmmmmmmmmmm...", ".dlllllllllllld.", "..mmmmmmmmmmm...", "...mmmmmmmmm....", "...mddddddmm....", "...mmmmmmmmm....", "...mddddmmmm....", "...mmmmmmmmm....", "...mdddddmmm....", "...mmmmmmmmm....", "..mmmmmmmmmmm...", ".dlllllllllllld.", "..mmmmmmmmmmm..."]), PARCHMENT],
  shop: [pad(["................", "................", ".....lmmmmd.....", "....lmwmmmmd....", "....dddddddd....", "....lmmmmmmd....", "....dddddddd....", "....lmmmmmmd....", "....dddddddd....", "....lmmmmmmd....", "....dddddddd...."]), GOLD],
  stats: [pad(["................", "................", "...........ll...", "...........mm...", "........ll.mm...", "........mm.mm...", ".....ll.mm.mm...", ".....mm.mm.mm...", "..ll.mm.mm.mm...", "..mm.mm.mm.mm...", "..mm.mm.mm.mm...", "..dd.dd.dd.dd..."]), GOLD],
  star: [sym(["........", ".......l", "......lm", "......lm", ".....lmm", ".lllllmm", "..lmmmmm", "...lmmmm", "....lmmm", "....lmmm", "...lmm..", "..lm....", ".lm....."]), GOLD],
  crown: [sym(["........", "........", "........", "........", "..m....m", "..mm..mm", "..mmmmmm", "..lmmmmm", "..lmemmm", "..lmmmmm", "..dddddd"]), GOLD],
  book: [pad(["................", "................", "...mmmmmmmmmm...", "..lmmmmmmmmmmd..", "..lmmwwwwwwmmd..", "..lmmmmmmmmmmd..", "..lmmmmmmmmmmd..", "..lmmmmmmmmmmd..", "..lmmmmmmmmmmd..", "..lmmmmmmmmmmd..", "..lmmmmmmmmmmd..", "..lmmmmmmmmmmd..", "..wwwwwwwwwwww..", "..dddddddddddd.."]), MATERIAL.rare],
  mail: [pad(["................", "................", "................", ".llllllllllllll.", ".lwmmmmmmmmmmwd.", ".lmwmmmmmmmmwmd.", ".lmmwmmmmmmwmmd.", ".lmmmwmmmmwmmmd.", ".lmmmmweewmmmmd.", ".lmmmmmeemmmmmd.", ".lmmmmmmmmmmmmd.", ".lmmmmmmmmmmmmd.", ".dddddddddddddd."]), PARCHMENT],
  soundOn: [pad(["................", "................", "......lm........", ".....lmm.....w..", "....lmmm..w...w.", ".lllmmmm...w..w.", ".lmmmmmm...w..w.", ".lmmmmmm.w.w..w.", ".lmmmmmm.w.w..w.", ".lmmmmmm...w..w.", ".dddmmmm...w..w.", "....dmmm..w...w.", ".....dmm.....w..", "......dm........"]), MATERIAL.common],
  soundOff: [pad(["................", "................", "......lm........", ".....lmm........", "....lmmm........", ".lllmmmm.e...e..", ".lmmmmmm..e.e...", ".lmmmmmm...e....", ".lmmmmmm..e.e...", ".lmmmmmm.e...e..", ".dddmmmm........", "....dmmm........", ".....dmm........", "......dm........"]), MATERIAL.common],
  terminal: [pad(["................", "................", ".llllllllllllll.", ".lmmmmmmmmmmmmd.", ".lmoooooooooomd.", ".lmowoooooooomd.", ".lmoowooooooomd.", ".lmowoowwwooomd.", ".lmoooooooooomd.", ".lmmmmmmmmmmmmd.", ".dddddddddddddd.", "......lmmd......", "....lmmmmmmd....", "....dddddddd...."]), MATERIAL.common],
  logout: [pad(["................", "................", "..dddddddd......", "..dmmmmmmd......", "..dmlmmmmd......", "..dmlmmmmd...w..", "..dmlmmmmd....w.", "..dmlmmwmwwwwwww", "..dmlmmmmd....w.", "..dmlmmmmd...w..", "..dmlmmmmd......", "..dmmmmmmd......", "..dddddddd......"]), LEATHER],
  help: [pad(["................", "................", ".....llllll.....", "...llmmmmmmdd...", "..lmmmoooommmd..", "..lmmoommoommd..", "..lmmmmmmoommd..", "..lmmmmmoommmd..", "..lmmmmoommmmd..", "..lmmmmoommmmd..", "..lmmmmmmmmmmd..", "..lmmmmoommmmd..", "...ddmmmmmmdd...", ".....dddddd....."]), GOLD],
};

const ui = new URL("../public/ui/", import.meta.url);
mkdirSync(ui, { recursive: true });
for (const [name, [rows, material]] of Object.entries(UI_SPRITES)) {
  if (rows.length !== 16 || rows.some((r) => r.length !== 16)) throw new Error(`${name}: sprite must be 16x16`);
  writeFileSync(new URL(`${name}.svg`, ui), svg(rows, material));
}
console.log(`Wrote ${Object.keys(UI_SPRITES).length} UI icons to ${ui.pathname}`);

/** Talent icons share sprites with items and the UI where one fits, colored by tree. */
const TREE: Record<TalentTree, Material> = {
  offense: { l: "#ffb8a8", m: "#e86a56", d: "#a83a2a" },
  defense: MATERIAL.rare,
  luck: { l: "#c8f0b0", m: "#6ac85a", d: "#3a8a3a" },
  general: GOLD,
};
const TALENT_SPRITES: Record<string, string[]> = {
  sword: SPRITES.sword,
  axe: SPRITES.axe,
  shield: SPRITES.shield,
  helm: SPRITES.helm,
  chest: SPRITES.chest,
  ring: SPRITES.ring,
  gold: UI_SPRITES.gold[0],
  skull: UI_SPRITES.raid[0],
  crown: UI_SPRITES.crown[0],
  bag: UI_SPRITES.bag[0],
  star: UI_SPRITES.star[0],
  book: UI_SPRITES.book[0],
  scroll: UI_SPRITES.scroll[0],
  shop: UI_SPRITES.shop[0],
  stats: UI_SPRITES.stats[0],
  flag: UI_SPRITES.guild[0],
  lightning: pad([
    "................", ".........llll...", "........lmmd....", ".......lmmd.....", "......lmmd......", ".....lmmmmmmd...",
    ".........lmd....", "........lmd.....", ".......lmd......", "......lmd.......", ".....ld.........",
  ]),
  flame: sym([
    "........", "........", ".......l", "......lm", "......lm", ".....lmm", "...l.lmm", "...lmlmm", "..lmmmmw",
    "..lmmmww", "..lmmwww", "..lmmwww", "...lmmww", "....lmmm", ".....ddd",
  ]),
  chip: sym([
    "........", "........", "...m.m.m", "...m.m.m", "..dddddd", "..dlllll", "mmdlmmmm", "..dlmwmm", "..dlmmmm",
    "mmdlmmmm", "..dlmmmm", "..dddddd", "...m.m.m", "...m.m.m",
  ]),
  heart: sym([
    "........", "........", "..lll...", ".lmmml..", ".lmwmmll", ".lmmmmmm", ".lmmmmmm", "..mmmmmm", "...mmmmm",
    "....mmmm", ".....mmm", "......mm", ".......m",
  ]),
  retry: pad([
    "................", "................", ".....lllll......", "....l.....m.m...", "...l.......mm...", "...l......mmm...",
    "...l............", "...l........m...", "............m...", "...mmm......m...", "...mm.......d...", "...m.m.....d....",
    "......ddddd.....",
  ]),
  lock: sym([
    "........", "........", "....llll", "...l....", "...l....", "...l....", "..dddddd", "..lmmmmm", "..lmmmmo",
    "..lmmmmo", "..lmmmmm", "..lmmmmm", "..dddddd",
  ]),
  server: sym([
    "........", "........", "..dddddd", "..lmemmm", "..dddddd", "........", "..dddddd", "..lmemmm", "..dddddd",
    "........", "..dddddd", "..lmemmm", "..dddddd",
  ]),
  clover: sym([
    "........", "........", "...ll...", "..lmml..", "..lmmml.", "...lmmml", ".....mmm", "...lmmml", "..lmmml.",
    "..lmml..", "...ll...",
  ]),
  ticket: pad([
    "................", "................", "................", "..lllllllllllll.", "..lmmmmm.mmmmmd.", "...mmwmm.mmmmm..",
    "...mmmmm.mmmmm..", "..lmmmmm.mmmmmd.", "..ddddddddddddd.",
  ]),
  magnet: sym([
    "........", "........", "..wwww..", "..wwww..", "..lmmm..", "..lmmm..", "..lmmm..", "..lmmm..", "..lmmm..",
    "..lmmmmm", "...lmmmm", "....dddd",
  ]),
  duck: pad([
    "................", "................", "......mmm.......", ".....mmmmm......", ".....mmomm......", "..eeemmmmm......",
    "......mmmm......", "....mmmmmmmmm..m", "...mmmmmmmmmmmm.", "...lmmmmmmmmmmd.", "...lmmmmmmmmmd..", "....ddddddddd...",
  ]),
  bug: sym([
    "........", "........", "....d...", ".....d..", "......mm", "..d.lmmm", "...dlmmm", "..ddlmmw", "...dlmmm",
    "..d.lmmm", "....lmmm", ".....ddd",
  ]),
  coffee: pad([
    "................", "................", ".....l..l.......", "......l..l......", ".....l..l.......", "................",
    "...lmmmmmmmd....", "...lmwwmmmmdmm..", "...lmmmmmmmd..m.", "...lmmmmmmmd..m.", "...lmmmmmmmdmm..", "....lmmmmmd.....",
    "..ddddddddddd...",
  ]),
  coins: pad([
    "................", "................", "................", ".....lmmmmd.....", ".....dddddd.....", "....lmmmmd......",
    "....dddddd......", ".....lmmmmd.....", ".....dddddd.....", "...lmmmmd.lmmmd.", "...dddddd.ddddd.", "....lmmmmdlmmmd.",
    "....dddddddddddd",
  ]),
};
/** Icons that keep their own colors instead of the tree's. */
const TALENT_MATERIAL: Record<string, Material> = { duck: GOLD, coffee: BONE, gold: GOLD, coins: GOLD };

const talents = new URL("../public/talents/", import.meta.url);
mkdirSync(talents, { recursive: true });
for (const [key, t] of Object.entries(TALENTS)) {
  const rows = TALENT_SPRITES[t.icon];
  if (!rows || rows.length !== 16 || rows.some((r) => r.length !== 16)) throw new Error(`${key}: sprite ${t.icon} must be 16x16`);
  writeFileSync(new URL(`${key}.svg`, talents), svg(rows, TALENT_MATERIAL[t.icon] ?? TREE[t.tree]));
}
console.log(`Wrote ${Object.keys(TALENTS).length} talent icons to ${talents.pathname}`);

// Stat icons reuse the sprites of the talents that raise the stat.
const STAT_SPRITES: Record<string, [string[], Material]> = {
  attack: [SPRITES.sword, TREE.offense],
  defense: [SPRITES.shield, TREE.defense],
  luck: [TALENT_SPRITES.clover, TREE.luck],
  fortune: [TALENT_SPRITES.coins, GOLD],
  power: [TALENT_SPRITES.lightning, GOLD],
};
for (const [name, [rows, material]] of Object.entries(STAT_SPRITES)) writeFileSync(new URL(`${name}.svg`, ui), svg(rows, material));
console.log(`Wrote ${Object.keys(STAT_SPRITES).length} stat icons to ${ui.pathname}`);

const STONE = { l: "#b8bec8", m: "#7a808a", d: "#4a4e56" };
const SHADOW = { l: "#7a7490", m: "#4a4560", d: "#2a2638" };

/** Writes one icon per key into `dir`, failing on a missing or malformed sprite. */
function writeIcons(dir: string, keys: string[], sprites: Record<string, [string[], Material]>) {
  const url = new URL(`../public/${dir}/`, import.meta.url);
  mkdirSync(url, { recursive: true });
  for (const key of keys) {
    const sprite = sprites[key];
    if (!sprite || sprite[0].length !== 16 || sprite[0].some((r) => r.length !== 16)) throw new Error(`${dir}/${key}: sprite must be 16x16`);
    writeFileSync(new URL(`${key}.svg`, url), svg(...sprite));
  }
  console.log(`Wrote ${keys.length} icons to ${url.pathname}`);
}

const MONSTER_SPRITES: Record<string, [string[], Material]> = {
  bugSwarm: [pad([
    "................", ".d.d............", "..lmw......d.d..", ".dlmmd......lmw.", "..lmm......dlmmd", ".d.dd.......lmm.",
    "...........d.dd.", "................", "......d.d.......", ".......lmw......", "......dlmmd.....", ".......lmm......",
    "......d.dd......",
  ]), TREE.offense],
  memoryLeakSlime: [sym([
    "........", "........", "........", "........", ".......l", ".....llm", "....lmmm", "...lmwmm", "..lmmoom", "..lmmoom",
    ".lmmmmmm", ".lmmmmmm", ".ddddddd", "...d....", "...d....",
  ]), MATERIAL.ancient],
  flakyTestGoblin: [sym([
    "........", "........", "........", "l.......", "lm...lll", ".lm.lmmm", "..lmmmmm", "...lmmmm", "...leemm", "...lmmmm",
    "...lmwow", "....lmmm", ".....ddd",
  ]), TREE.luck],
  nullPointerWraith: [sym([
    "........", "........", ".....lll", "....lmmm", "...lmmmm", "...lmmmm", "...lmoom", "...lmoom", "...lmmmm", "...lmmmm",
    "...lmmmm", "...lmmmm", "...lm.mm", "...l...m",
  ]), BONE],
  raceConditionTwins: [sym([
    "........", "........", "........", "..lmmm..", "..lomo..", "..lmmm..", "...mm...", ".lmmmmm.", ".l.mmm.m", "...mmm..",
    "...m.m..", "...m.m..", "..dd.dd.",
  ]), MATERIAL.rare],
  legacyCodeGolem: [sym([
    "........", "........", "....llll", "....lmmm", "....leem", "....lmmm", ".llllmmm", ".lmmmmmm", ".lmmdmmm", ".lm.lmmm",
    ".lm.lmmm", ".dd.lmmm", "....lmm.", "....lmm.", "...dddd.",
  ]), STONE],
  mergeConflictHydra: [sym([
    "......ll", ".ll...lm", "lmem..le", "lmmm..lm", ".lm...lm", "..lm..lm", "...lm.lm", "....lmlm", "....lmmm", "...lmmmm",
    "..lmmmmm", "..lmmmmm", "...ddddd",
  ]), MATERIAL.epic],
  dependencyDragon: [pad([
    "................", "..l....l........", "..lm...lm.......", "...lmmmmmm......", "...lmmmmmmmm....", "..lmmmemmmmmmm..",
    "..lmmmmmmmmmmmm.", "..lmmmmmmwwwwww.", "..lmmmmmmmmmmmd.", "...lmmmmmddddd..", "...lmmmm........", "..lmmmmm........",
    ".lmmmmmm........", ".ddddddd........",
  ]), TREE.offense],
};
writeIcons("monsters", Object.keys(MONSTERS), MONSTER_SPRITES);

const BOSS_SPRITES: Record<string, [string[], Material]> = {
  // The Monolith
  0: [sym([
    "........", ".....lll", ".....lmm", ".....lwm", ".....lmm", ".....lme", ".....lmm", ".....lmm", ".....lmm", ".....lmm",
    ".....lmm", ".....lmm", ".....lmm", ".....lmm", "...ddddd",
  ]), SHADOW],
  // The Legacy Mainframe
  1: [sym([
    "........", "..llllll", "..lmmmmm", "..lmddmm", "..ldwwdm", "..ldwwdm", "..lmddmm", "..lmmmmm", "..dddddd", "..lmmmmm",
    "..lmemem", "..lmmmmm", "..dddddd", "..lm....",
  ]), MATERIAL.common],
  // The Kubernetes Kraken
  2: [sym([
    "........", "........", ".....lll", "....lmmm", "...lmmmm", "...lmwmm", "...lmoom", "...lmmmm", "..lmmmmm", ".lm.m.mm",
    "lm.m..m.", "m..m..m.", ".m..m..m",
  ]), MATERIAL.rare],
  // The Infinite Loop
  3: [pad([
    "................", "................", "................", "................", "..lmm......mmd..", ".lm..m....m..md.",
    ".l....m..m....d.", ".l.....mm.....d.", ".l.....mm.....d.", ".l....m..m....d.", ".lm..m....m..md.", "..lmm......mmd..",
  ]), MATERIAL.ancient],
  // The Production Outage
  4: [sym([
    "........", ".w.....l", "..w...lm", ".....lwm", "w...lmwm", "....lmmm", "....lmmm", "....lmmm", "...ddddd", "..lmmmmm",
    "..dddddd",
  ]), TREE.offense],
  // The Big Rewrite
  5: [pad([
    "................", "................", "..llllllllll....", "..lmmmmmmmmd....", "..lmddddddmd..e.", "..lmmmmmmmmd.eee",
    "..lmdddddmmdeee.", "..lmmmmmmmmeee..", "..lmddddddeeed..", "..lmmmmmmeeemd..", "..lmdddd.eemmd..", "..lmmmmmwemmmd..",
    "..lmmmmmmmmmmd..", "..dddddddddddd..",
  ]), PARCHMENT],
  // The Debt Collector
  6: [sym([
    "........", ".....lll", "....lmmm", "...lmmmm", "...lmooo", "...lmoeo", "...lmooo", "..lmmmmm", "..lmmmmm", ".lmmmmmm",
    ".lmmmmmm", "lmmmmmmm", "dddddddd",
  ]), SHADOW],
  // The Distributed Monolith
  7: [pad([
    "................", ".lll.......lll..", ".lmm.......lmm..", ".lem.......lem..", ".lmmwwwwwwwlmm..", ".lmm...w...lmm..",
    ".ddd...w...ddd..", ".......w........", "......lll.......", "......lem.......", "......lmm.......", "......lmm.......",
    "......ddd.......",
  ]), SHADOW],
  // The Halting Problem
  8: [sym([
    "........", ".....lll", "....lmmm", "...lmmmm", "..lmmmmm", "..lmmmmm", "..lwwwww", "..lwwwww", "..lmmmmm", "..lmmmmm",
    "...lmmmm", "....lmmm", ".....ddd", ".......H", ".......H", ".......H",
  ]), TREE.offense],
  // The Final Migration
  9: [pad([
    "................", "................", "....llllllll....", "...lwwwwwwwwd...", "...lmmmmmmmmd...", "...dddddddddd...",
    "...lmmmmmmmmd...", "...dddddddddd...", "...lmmmmmmmmd...", "...dddddddddd...", "....dddddddd....", "................",
    "...........e....", "..eeeeeeeeeee...", "...........e....",
  ]), MATERIAL.divine],
};
writeIcons("bosses", RAID_BOSSES.map((_, tier) => String(tier)), BOSS_SPRITES);

const BUFF_SPRITES: Record<string, [string[], Material]> = {
  standupSnacks: [sym([
    "........", "........", "........", ".....lll", "...llmmm", "..lmwmme", ".lmemm..", ".lmm....", ".lmm....", ".lmmm...",
    "..lmmmmm", "...ddmmm", ".....ddd",
  ]), MATERIAL.mythic],
  bonusRound: [UI_SPRITES.bag[0], GOLD],
  warRoom: [sym([
    "........", ".w......", "..wl....", "...lm...", "....lm..", ".....lm.", "......lm", ".......l", "......m.", ".....m..",
    "...dhd..", "....h...", "...h....", "..H.....",
  ]), MATERIAL.common],
  sharedCache: [sym([
    "........", "........", "........", "........", "...lllll", "..lmmmmm", "..lmmmmm", "..ddddde", "..lmmmme", "..lmmmmm",
    "..lmmmmm", "..dddddd",
  ]), LEATHER],
  asyncStandup: [pad([
    "................", "................", ".....llllll.....", "...llmmmmmmdd...", "..lmmmmoommmmd..", "..lmmmmoommmmd..",
    ".lmmmmmoommmmmd.", ".lmmmmmooooommd.", ".lmmmmmooooommd.", ".lmmmmmmmmmmmmd.", "..lmmmmmmmmmmd..", "..lmmmmmmmmmmd..",
    "...ddmmmmmmdd...", ".....dddddd.....",
  ]), PARCHMENT],
};
writeIcons("buffs", Object.keys(GUILD_BUFFS), BUFF_SPRITES);

const DOOR = sym([
  "........", "........", "....llll", "...lmmmm", "..lmmHHH", "..lmHHHH", "..lmHhHH", "..lmHhHH", "..lmHhHH", "..lmHHHe",
  "..lmHhHH", "..lmHhHH", "..lmHhHH", "..dddddd",
]);
/** Achievements reuse the sprites of what they are about. */
const ACHIEVEMENT_SPRITES: Record<string, [string[], Material]> = {
  firstQuest: [UI_SPRITES.scroll[0], PARCHMENT],
  quests10: [UI_SPRITES.book[0], MATERIAL.rare],
  quests100: [UI_SPRITES.star[0], MATERIAL.epic],
  quests500: [UI_SPRITES.terminal[0], GOLD],
  streak: [TALENT_SPRITES.flame, TREE.offense],
  firstBlood: [SPRITES.sword, TREE.offense],
  bugHunter: [TALENT_SPRITES.bug, TREE.luck],
  dragon: MONSTER_SPRITES.dependencyDragon,
  legendary: [SPRITES.ring, MATERIAL.legendary],
  fullSet: [SPRITES.chest, GOLD],
  dungeon: [DOOR, STONE],
  party: [MONSTER_SPRITES.raceConditionTwins[0], GOLD],
  raid: UI_SPRITES.raid,
  merchant: [UI_SPRITES.gold[0], GOLD],
  shopper: UI_SPRITES.shop,
  founder: UI_SPRITES.guild,
  senior: [UI_SPRITES.star[0], GOLD],
  principal: UI_SPRITES.crown,
  tour: UI_SPRITES.help,
};
writeIcons("achievements", ACHIEVEMENTS.map((a) => a.key), ACHIEVEMENT_SPRITES);
