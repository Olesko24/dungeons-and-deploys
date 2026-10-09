import { monsterEmoji } from "./icons.ts";

export type Status = {
  quest: { startedAt: string; endsAt: string; resolved: boolean } | null;
  readyAt: string;
  rested?: number;
  character: { name: string; level: number; gold: number };
  encounter?: { key?: string; name: string; expiresAt: string; winChance: number } | null;
  dungeon?: { code: string; state: string; startsAt: string; cleared: number; stageEndsAt: string | null } | null;
};

export const minutesUntil = (iso: string, now = Date.now()) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60_000));
export const bar = (filled: number, total: number) => "■".repeat(filled) + "□".repeat(Math.max(0, total - filled));

/** Time progress of a quest as 9 blocks. */
export function progress(quest: { startedAt: string; endsAt: string }, now = Date.now()) {
  const start = new Date(quest.startedAt).getTime();
  const share = Math.min(1, Math.max(0, (now - start) / (new Date(quest.endsAt).getTime() - start)));
  return bar(Math.floor(share * 9), 9);
}

/** One line for status lines and prompts, e.g. `⚔ Quest 23m · ■■■■□□□□□ · Lv 7 · 312g`. */
export function shortStatus({ quest, readyAt, rested, character, encounter, dungeon }: Status, now = Date.now()) {
  const tail = `Lv ${character.level} · ${character.gold}g`;
  if (encounter && minutesUntil(encounter.expiresAt, now) > 0) {
    return `${monsterEmoji(encounter.key)} ${encounter.name}! quest fight · ${minutesUntil(encounter.expiresAt, now)}m · ${tail}`;
  }
  if (dungeon?.state === "lobby") return `Dungeon ${dungeon.code} starts in ${minutesUntil(dungeon.startsAt, now)}m · ${tail}`;
  if (dungeon?.state === "running" && dungeon.stageEndsAt) {
    return `Dungeon ${dungeon.cleared + 1}/4 · ${minutesUntil(dungeon.stageEndsAt, now)}m · ${tail}`;
  }
  if (quest && !quest.resolved) {
    const left = minutesUntil(quest.endsAt, now);
    return `⚔ Quest ${left > 0 ? `${left}m` : "done"} · ${progress(quest, now)} · ${tail}`;
  }
  const rest = minutesUntil(readyAt, now);
  const bonus = rested ? ` · ${rested} rested` : "";
  return rest > 0 ? `Resting ${rest}m${bonus} · ${tail}` : `Quest ready${bonus} · ${tail}`;
}

const RARITY_RGB: Record<string, [number, number, number]> = {
  common: [0xb8, 0xbe, 0xc8],
  uncommon: [0x7c, 0xd4, 0x7c],
  rare: [0x6a, 0xa8, 0xf0],
  epic: [0xb4, 0x8c, 0xff],
  legendary: [0xff, 0xb4, 0x5c],
  mythic: [0xff, 0x6b, 0x8a],
  ancient: [0x3f, 0xd0, 0xc0],
  divine: [0xff, 0xf0, 0x7a],
  celestial: [0xf0, 0x70, 0xff],
  eternal: [0xf4, 0xf2, 0xff],
};

/** Colors text by rarity with 24-bit ANSI, unless NO_COLOR is set or output is not a terminal. */
export function rarityColor(text: string, rarity: string, enabled = !process.env.NO_COLOR && process.stdout.isTTY) {
  const [r, g, b] = RARITY_RGB[rarity] ?? RARITY_RGB.common;
  return enabled ? `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m` : text;
}

type Stats = { attack: number; defense: number; luck: number; fortune: number };

export type InventoryItem = { id: number; name: string; rarity: string; stats: Stats; equippedSlot: string | null; listed?: boolean; price?: number | null };

/** Non-zero stats in a fixed order, e.g. `ATK 5 · LCK +2`. */
export const statsText = (s: Stats) =>
  [
    s.attack && `ATK ${s.attack}`,
    s.defense && `DEF ${s.defense}`,
    s.luck && `LCK +${s.luck}`,
    s.fortune && `FOR +${s.fortune}%`,
  ]
    .filter(Boolean)
    .join(" · ");

export function inventoryLines(items: InventoryItem[], bonus: Stats, color = rarityColor, limit?: number) {
  const line = (i: InventoryItem, prefix: string) =>
    `  ${prefix}${`#${i.id}`.padEnd(6)}${color(i.name.padEnd(40), i.rarity)}${i.rarity.padEnd(11)}${statsText(i.stats)}${i.listed ? ` · on market for ${i.price}g` : ""}`;
  const equipped = items.filter((i) => i.equippedSlot);
  const bag = items.filter((i) => !i.equippedSlot);
  return [
    `Equipped · ${statsText(bonus) || "no stats yet"}`,
    ...(equipped.length ? equipped.map((i) => line(i, (i.equippedSlot as string).padEnd(10))) : ["  nothing yet"]),
    "",
    `Bag (${bag.length})${limit ? ` · ${items.length} of ${limit} items${items.length >= limit ? ", full: new loot is scrapped for gold" : ""}` : ""}`,
    ...(bag.length ? bag.map((i) => line(i, "")) : ["  empty, finish quests to find loot"]),
  ];
}
