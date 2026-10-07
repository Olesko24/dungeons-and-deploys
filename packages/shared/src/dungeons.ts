import { type MonsterKey, fightRewards, winChance } from "./combat.ts";
import { ITEM_TYPES, type Stats, WEAPONS, rollRarity } from "./items.ts";

export const DUNGEON_LOBBY_MS = 5 * 60 * 1000;
export const DUNGEON_STAGE_MS = 15 * 60 * 1000;
export const DUNGEON_SLOTS_PER_STAGE = 3;
export const DUNGEON_MAX_PARTY = 5;

/** Three stages and a boss. Each stage fights like its monster with the monster's power scaled by `power`. */
export const DUNGEON_STAGES: { name: string; monster: MonsterKey; power: number }[] = [
  { name: "Halls of Legacy Code", monster: "legacyCodeGolem", power: 0.5 },
  { name: "Race Condition Crossing", monster: "raceConditionTwins", power: 0.6 },
  { name: "Merge Conflict Depths", monster: "mergeConflictHydra", power: 0.5 },
  { name: "Lair of the Dependency Dragon", monster: "dependencyDragon", power: 0.4 },
];

export type DungeonMember = { level: number; gear: Stats; presentSlots: number };

/**
 * Average member odds against the stage, times the share of present slots, plus 5 points of teamwork per
 * extra member. Every member makes the stage 10% tougher. Kept within 5-95%.
 */
export function stageChance(stage: number, members: DungeonMember[]) {
  const { monster, power } = DUNGEON_STAGES[stage];
  const size = members.length;
  const toughness = power * (1 + 0.1 * (size - 1));
  const odds = members.reduce((sum, m) => sum + scaledChance(m, monster, toughness), 0) / size;
  const presence = members.reduce((sum, m) => sum + m.presentSlots, 0) / (DUNGEON_SLOTS_PER_STAGE * size);
  return Math.min(0.95, Math.max(0.05, odds * presence + 0.05 * (size - 1)));
}

/** winChance against the stage monster, with the monster's power multiplied by the stage toughness. */
function scaledChance(m: DungeonMember, monster: MonsterKey, toughness: number) {
  // winChance(p) = player / (player + naked * power): solve for the ratio and rescale the monster.
  const base = winChance(m.level, { ...m.gear, luck: 0 }, monster);
  const ratio = base / (1 - base);
  const scaled = ratio / (ratio + toughness);
  return scaled + m.gear.luck / 100;
}

/** Rewards per member for one cleared stage, 10% more per extra member. */
export function stageRewards(stage: number, level: number, size: number, fortune = 0) {
  const r = fightRewards(DUNGEON_STAGES[stage].monster, level, fortune);
  const bonus = 1 + 0.1 * (size - 1);
  return { xp: Math.round(r.xp * bonus), gold: Math.round(r.gold * bonus) };
}

/** Guaranteed loot for every member when the boss falls. Bigger parties roll rarity more often. */
export function bossLoot(level: number, size: number, random: () => number) {
  const type = ITEM_TYPES[Math.floor(random() * ITEM_TYPES.length)];
  let base: string = type;
  if (type === "weapon" || type === "twoHanded") {
    const kinds = (Object.keys(WEAPONS) as (keyof typeof WEAPONS)[]).filter((k) => WEAPONS[k].hands === (type === "weapon" ? 1 : 2));
    base = kinds[Math.floor(random() * kinds.length)];
  }
  return `${base}.${rollRarity(level, 1 + Math.floor(size / 2), random)}`;
}
