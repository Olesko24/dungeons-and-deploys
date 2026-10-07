export const SLOT_MS = 5 * 60 * 1000;
export const QUEST_SLOTS = 9;
export const QUEST_MS = QUEST_SLOTS * SLOT_MS;
export const COOLDOWN_MS = 15 * 60 * 1000;
export const MIN_SLOTS_FOR_SUCCESS = 5;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => Math.round(100 * level ** 1.5);

export function levelFromXp(totalXp: number) {
  let level = 1;
  let rest = totalXp;
  while (rest >= xpToNext(level)) rest -= xpToNext(level++);
  return { level, xpIntoLevel: rest, xpForNext: xpToNext(level) };
}

export const countSlots = (slots: number) => slots.toString(2).replaceAll("0", "").length;

export * from "./combat.ts";
export * from "./dungeons.ts";
export * from "./items.ts";
export * from "./market.ts";

/**
 * `random` returns values in [0, 1), like Math.random.
 * `luck` adds percentage points to the success chance, `fortune` adds percent to the gold reward.
 */
export function questOutcome(presentSlots: number, random: () => number, luck = 0, fortune = 0) {
  if (presentSlots < MIN_SLOTS_FOR_SUCCESS) return { success: false, xp: 2 * presentSlots, gold: 0 };
  const chance = Math.min(0.6 + 0.1 * (presentSlots - MIN_SLOTS_FOR_SUCCESS) + luck / 100, 0.95);
  if (random() >= chance) return { success: false, xp: 2 * presentSlots, gold: 0 };
  const gold = 2 * presentSlots + Math.floor(random() * 6);
  return { success: true, xp: 10 * presentSlots, gold: Math.floor(gold * (1 + fortune / 100)) };
}
