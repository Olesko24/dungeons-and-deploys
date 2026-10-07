/** Rest after a quest. The quest itself resolves at once. */
export const COOLDOWN_MS = 45 * 60 * 1000;
export const QUEST_BASE_CHANCE = 0.75;
/** Rarity rolls for quest loot, the best one counts. */
export const QUEST_LOOT_ROLLS = 2;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => Math.round(100 * level ** 1.5);

export function levelFromXp(totalXp: number) {
  let level = 1;
  let rest = totalXp;
  while (rest >= xpToNext(level)) rest -= xpToNext(level++);
  return { level, xpIntoLevel: rest, xpForNext: xpToNext(level) };
}

export * from "./achievements.ts";
export * from "./combat.ts";
export * from "./dungeons.ts";
export * from "./items.ts";
export * from "./market.ts";
export * from "./raids.ts";
export * from "./shop.ts";

/**
 * A quest resolves the moment it starts, the dice decide.
 * `luck` adds percentage points to the success chance, `fortune` adds percent to the gold reward.
 */
export function questOutcome(random: () => number, luck = 0, fortune = 0) {
  const chance = Math.min(QUEST_BASE_CHANCE + luck / 100, 0.95);
  if (random() >= chance) return { success: false, xp: 10, gold: 0 };
  const gold = 14 + Math.floor(random() * 6);
  return { success: true, xp: 70, gold: Math.floor(gold * (1 + fortune / 100)) };
}

const QUEST_NAMES = [
  "Hunt the Off-by-One Goblin",
  "Clear the Merge Conflict Swamp",
  "Escort the Legacy Monolith",
  "Banish the Flaky Test Wraith",
  "Recover the Lost Semicolon",
  "Slay the Memory Leak Hydra",
  "Map the Undocumented Catacombs",
  "Tame the Race Condition Twins",
  "Storm the Dependency Hell Keep",
  "Silence the Pager at 3 AM",
  "Untangle the Regex Labyrinth",
  "Defend the Production Gate",
];

export const questName = (id: number) => QUEST_NAMES[id % QUEST_NAMES.length];

export const GUILD_MAX_MEMBERS = 50;

/** Guilds level on the same curve as characters, fed by 1/10 of their members' quest XP. */
export const guildLevel = (xp: number) => levelFromXp(Math.floor(xp / 10));
