import type { Stats } from "./items.ts";

export const ENCOUNTER_CHANCE = 0.02;
export const ENCOUNTER_MS = 5 * 60 * 1000;

/** `power` scales a monster against an unequipped player of the same level. Rarer monsters are tougher and pay more. */
export const MONSTERS = {
  bugSwarm: { name: "Bug Swarm", power: 0.6, weight: 20 },
  memoryLeakSlime: { name: "Memory Leak Slime", power: 0.8, weight: 18 },
  flakyTestGoblin: { name: "Flaky Test Goblin", power: 1, weight: 18 },
  nullPointerWraith: { name: "Null Pointer Wraith", power: 1.1, weight: 14 },
  raceConditionTwins: { name: "Race Condition Twins", power: 1.3, weight: 12 },
  legacyCodeGolem: { name: "Legacy Code Golem", power: 1.5, weight: 10 },
  mergeConflictHydra: { name: "Merge Conflict Hydra", power: 1.8, weight: 6 },
  dependencyDragon: { name: "Dependency Dragon", power: 2.5, weight: 2 },
} as const;
export type MonsterKey = keyof typeof MONSTERS;
const MONSTER_KEYS = Object.keys(MONSTERS) as MonsterKey[];

export function rollMonster(random: () => number): MonsterKey {
  let r = random() * MONSTER_KEYS.reduce((sum, k) => sum + MONSTERS[k].weight, 0);
  for (const key of MONSTER_KEYS) {
    r -= MONSTERS[key].weight;
    if (r < 0) return key;
  }
  return MONSTER_KEYS[0];
}

/** Attack scales linearly, defense multiplies it with a gentle slope so tanks are not invincible. */
export const combatPower = (level: number, gear: Stats) => (4 + level + gear.attack) * (1 + (level + gear.defense) / 20);

/** Win chance against a monster of the player's level, plus luck in percentage points, kept within 5-95%. */
export function winChance(level: number, gear: Stats, monster: MonsterKey) {
  const player = combatPower(level, gear);
  const naked = combatPower(level, { attack: 0, defense: 0, luck: 0, fortune: 0 });
  const chance = player / (player + naked * MONSTERS[monster].power) + gear.luck / 100;
  return Math.min(0.95, Math.max(0.05, chance));
}

/** Rewards for a won fight, scaled by the monster's toughness. Gold gets the fortune bonus. */
export function fightRewards(monster: MonsterKey, level: number, fortune = 0) {
  const p = MONSTERS[monster].power;
  return {
    xp: Math.round((10 + 3 * level) * p),
    gold: Math.floor(Math.round((3 + level) * p) * (1 + fortune / 100)),
  };
}
