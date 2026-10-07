export type Status = {
  quest: { endsAt: string; presentSlots: number; totalSlots: number; resolved: boolean } | null;
  readyAt: string;
  character: { name: string; level: number; gold: number };
  encounter?: { name: string; expiresAt: string; winChance: number } | null;
  dungeon?: { code: string; state: string; startsAt: string; cleared: number; stageEndsAt: string | null } | null;
};

export const minutesUntil = (iso: string, now = Date.now()) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60_000));
export const bar = (filled: number, total: number) => "■".repeat(filled) + "□".repeat(Math.max(0, total - filled));

/** One line for status lines and prompts, e.g. `⚔ Quest 23m · ■■■■□□□□□ · Lv 7 · 312g`. */
export function shortStatus({ quest, readyAt, character, encounter, dungeon }: Status, now = Date.now()) {
  const tail = `Lv ${character.level} · ${character.gold}g`;
  if (encounter && minutesUntil(encounter.expiresAt, now) > 0) {
    return `⚠ ${encounter.name}! quest fight · ${minutesUntil(encounter.expiresAt, now)}m · ${tail}`;
  }
  if (dungeon?.state === "lobby") return `Dungeon ${dungeon.code} starts in ${minutesUntil(dungeon.startsAt, now)}m · ${tail}`;
  if (dungeon?.state === "running" && dungeon.stageEndsAt) {
    return `Dungeon ${dungeon.cleared + 1}/4 · ${minutesUntil(dungeon.stageEndsAt, now)}m · ${tail}`;
  }
  if (quest && !quest.resolved) {
    const left = minutesUntil(quest.endsAt, now);
    return `⚔ Quest ${left > 0 ? `${left}m` : "done"} · ${bar(quest.presentSlots, quest.totalSlots)} · ${tail}`;
  }
  const rest = minutesUntil(readyAt, now);
  return rest > 0 ? `Resting ${rest}m · ${tail}` : `Quest ready · ${tail}`;
}

const RARITY_RGB: Record<string, [number, number, number]> = {
  common: [0xb8, 0xbe, 0xc8],
  rare: [0x6a, 0xa8, 0xf0],
  epic: [0xb4, 0x8c, 0xff],
  legendary: [0xff, 0xb4, 0x5c],
};

/** Colors text by rarity with 24-bit ANSI, unless NO_COLOR is set or output is not a terminal. */
export function rarityColor(text: string, rarity: string, enabled = !process.env.NO_COLOR && process.stdout.isTTY) {
  const [r, g, b] = RARITY_RGB[rarity];
  return enabled ? `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m` : text;
}

type Stats = { attack: number; defense: number; luck: number; fortune: number };

export type InventoryItem = { id: number; name: string; rarity: string; stats: Stats; equippedSlot: string | null; listed?: boolean };

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

export function inventoryLines(items: InventoryItem[], bonus: Stats, color = rarityColor) {
  const line = (i: InventoryItem, prefix: string) =>
    `  ${prefix}${`#${i.id}`.padEnd(6)}${color(i.name.padEnd(40), i.rarity)}${i.rarity.padEnd(11)}${statsText(i.stats)}${i.listed ? " · on market" : ""}`;
  const equipped = items.filter((i) => i.equippedSlot);
  const bag = items.filter((i) => !i.equippedSlot);
  return [
    `Equipped · ${statsText(bonus) || "no stats yet"}`,
    ...(equipped.length ? equipped.map((i) => line(i, (i.equippedSlot as string).padEnd(10))) : ["  nothing yet"]),
    "",
    `Bag (${bag.length})`,
    ...(bag.length ? bag.map((i) => line(i, "")) : ["  empty, finish quests to find loot"]),
  ];
}
