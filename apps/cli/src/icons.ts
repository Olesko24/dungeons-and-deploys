import { BOSSES, ITEM_ROWS, MONSTERS, RARITY_COLORS, type Sprite } from "./sprites.ts";

/** Pixel icons need 24-bit color in a terminal. Piped output, NO_COLOR and DND_ICONS=0 get plain text. */
export const iconsEnabled = () => !process.env.NO_COLOR && process.env.DND_ICONS !== "0" && !!process.stdout.isTTY;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(";");

/** Draws a sprite with half blocks, two pixel rows per line. Empty rows and columns at the edges are left out. */
export function draw({ rows, colors }: Sprite) {
  const used = (r: string) => r.split("").some((c) => colors[c]);
  const top = rows.findIndex(used);
  if (top < 0) return [];
  const body = rows.slice(top, rows.findLastIndex(used) + 1);
  if (body.length % 2) body.push(".".repeat(body[0].length));
  const columns = body[0].split("").map((_, x) => x).filter((x) => body.some((r) => colors[r[x]]));
  const lines = [];
  for (let y = 0; y < body.length; y += 2) {
    let line = "";
    for (let x = columns[0]; x <= columns.at(-1)!; x++) {
      const [up, down] = [colors[body[y][x]], colors[body[y + 1][x]]];
      if (up && down) line += `\x1b[38;2;${rgb(up)};48;2;${rgb(down)}m▀\x1b[0m`;
      else if (up) line += `\x1b[38;2;${rgb(up)}m▀\x1b[0m`;
      else if (down) line += `\x1b[38;2;${rgb(down)}m▄\x1b[0m`;
      else line += " ";
    }
    lines.push(line);
  }
  return lines;
}

export const monsterIcon = (key: string | undefined) => (key && MONSTERS[key] ? draw(MONSTERS[key]) : []);
export const bossIcon = (tier: number) => (BOSSES[tier] ? draw(BOSSES[tier]) : []);
/** An item icon from its key, e.g. `sword.epic`. */
export function itemIcon(key: string | undefined) {
  const [base, rarity] = key?.split(".") ?? [];
  return ITEM_ROWS[base] && RARITY_COLORS[rarity] ? draw({ rows: ITEM_ROWS[base], colors: RARITY_COLORS[rarity] }) : [];
}

/** Text lines to the right of an icon, or the text alone without icons. */
export function beside(icon: string[], text: string[], enabled = iconsEnabled()) {
  if (!enabled || !icon.length) return text;
  const width = icon[0].split("").filter((c) => "▀▄ ".includes(c)).length;
  return Array.from({ length: Math.max(icon.length, text.length) }, (_, i) => `${icon[i] ?? " ".repeat(width)}  ${text[i] ?? ""}`.trimEnd());
}

const MONSTER_EMOJI: Record<string, string> = {
  bugSwarm: "🐞",
  memoryLeakSlime: "🫠",
  flakyTestGoblin: "👺",
  nullPointerWraith: "👻",
  raceConditionTwins: "👯",
  legacyCodeGolem: "🗿",
  mergeConflictHydra: "🐍",
  dependencyDragon: "🐉",
};
/** One character for a monster, for status lines that have no room for pixel icons. */
export const monsterEmoji = (key: string | undefined) => (key && MONSTER_EMOJI[key]) ?? "⚠";
