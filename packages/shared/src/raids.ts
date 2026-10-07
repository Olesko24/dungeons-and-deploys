import { randomItemKey } from "./items.ts";

export const RAID_MIN_PLAYERS = 5;
export const RAID_TICKS = 6;
export const RAID_TICK_MS = 5 * 60 * 1000;
export const RAID_BOSS = "The Monolith";

/**
 * Boss HP is 85% of what the whole raid deals with full presence and average rolls,
 * so a raid wins when most members show up for most ticks.
 */
export const raidBossHp = (powers: number[]) => Math.round(powers.reduce((s, p) => s + p, 0) * RAID_TICKS * 0.85);

/** One member's hit in one tick, 80-120% of their combat power. */
export const raidDamage = (power: number, random: () => number) => Math.round(power * (0.8 + 0.4 * random()));

export const raidRewards = (level: number) => ({ xp: 50 + 15 * level, gold: 20 + 5 * level });

/** Guaranteed raid loot with three rarity rolls. */
export const raidLoot = (level: number, random: () => number) => randomItemKey(level, 3, random);
