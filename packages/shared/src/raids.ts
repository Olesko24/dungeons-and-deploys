import { randomItemKey } from "./items.ts";

export const RAID_MIN_PLAYERS = 5;
export const RAID_TICKS = 6;
export const RAID_TICK_MS = 5 * 60 * 1000;
export const RAID_BOSS = "The Monolith";

/**
 * Boss HP scales with each raider's power without gear (`base`) and, damped, with their gear:
 * unequipped raids win about half the time, well-equipped ones up to about 85%.
 * Every tick the boss rolls a phase that scales the raid's damage, which keeps the outcome open.
 */
export const raidBossHp = (raiders: { power: number; base: number }[]) =>
  Math.round(raiders.reduce((s, r) => s + r.base * (r.power / r.base) ** 0.95, 0) * RAID_TICKS);

/** How hard the boss is to hit this tick: 0.6 to 1.4 times the raid's damage. */
export const raidPhase = (random: () => number) => 0.6 + 0.8 * random();

/** One member's hit in one tick, 80-120% of their combat power, scaled by the boss phase. */
export const raidDamage = (power: number, phase: number, random: () => number) => Math.round(power * phase * (0.8 + 0.4 * random()));

export const raidRewards = (level: number) => ({ xp: 50 + 15 * level, gold: 20 + 5 * level });

/** Guaranteed raid loot with three rarity rolls. */
export const raidLoot = (level: number, random: () => number) => randomItemKey(level, 3, random);
