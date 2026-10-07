import { randomItemKey } from "./items.ts";

export const RAID_MIN_PLAYERS = 5;
export const RAID_TICKS = 6;
export const RAID_TICK_MS = 5 * 60 * 1000;

/**
 * Raid bosses from easy to hard. A guild unlocks the next one by beating the one before. `power` is the
 * recommended shown combat power per raider, loot rolls rarity `rolls` times at loot level `lootLevel` or
 * the raider's level if higher, and XP and gold are multiplied by `reward`.
 */
export const RAID_BOSSES = [
  { name: "The Monolith", power: 250, rolls: 3, lootLevel: 5, reward: 1, flavor: "Twelve years of features, zero modules." },
  { name: "The Legacy Mainframe", power: 600, rolls: 4, lootLevel: 10, reward: 1.5, flavor: "Runs COBOL. Pays your salary. Nobody dares to reboot it." },
  { name: "The Kubernetes Kraken", power: 1400, rolls: 5, lootLevel: 15, reward: 2, flavor: "Every tentacle is a sidecar. Every sidecar has a sidecar." },
  { name: "The Infinite Loop", power: 3000, rolls: 6, lootLevel: 20, reward: 3, flavor: "It ends when it ends. It never ends." },
  { name: "The Production Outage", power: 6000, rolls: 7, lootLevel: 25, reward: 4, flavor: "Friday, 17:59. Every pager in the building goes off at once." },
  { name: "The Big Rewrite", power: 12000, rolls: 8, lootLevel: 30, reward: 6, flavor: "Promised in two sprints. Three years ago." },
  { name: "The Debt Collector", power: 18000, rolls: 9, lootLevel: 45, reward: 8, flavor: "Came for the interest. Stays for the principal." },
  { name: "The Distributed Monolith", power: 35000, rolls: 10, lootLevel: 60, reward: 10, flavor: "All the coupling of a monolith, all the latency of microservices." },
  { name: "The Halting Problem", power: 65000, rolls: 11, lootLevel: 75, reward: 13, flavor: "Nobody has ever proven it can be beaten." },
  { name: "The Final Migration", power: 120000, rolls: 12, lootLevel: 90, reward: 16, flavor: "Every table, every row, no rollback." },
];

/**
 * Boss HP depends on the boss and the number of raiders only, so stronger raiders win more often. At the
 * recommended power the raid deals about 1/0.97 of the HP on average, which wins about 60% of the time
 * once the boss phases are rolled. Shown power is ten times the raw damage per tick.
 */
export const raidBossHp = (tier: number, raiders: number) => Math.round((0.97 * RAID_BOSSES[tier].power * raiders * RAID_TICKS) / 10);

/** How hard the boss is to hit this tick: 0.6 to 1.4 times the raid's damage. */
export const raidPhase = (random: () => number) => 0.6 + 0.8 * random();

/** One member's hit in one tick, 80-120% of their combat power, scaled by the boss phase. */
export const raidDamage = (power: number, phase: number, random: () => number) => Math.round(power * phase * (0.8 + 0.4 * random()));

export const raidRewards = (level: number, tier: number) => {
  const { reward } = RAID_BOSSES[tier];
  return { xp: Math.round((50 + 15 * level) * reward), gold: Math.round((20 + 5 * level) * reward) };
};

/** Guaranteed raid loot. Harder bosses roll rarity more often and at least at their loot level. */
export const raidLoot = (level: number, tier: number, random: () => number) =>
  randomItemKey(Math.max(level, RAID_BOSSES[tier].lootLevel), RAID_BOSSES[tier].rolls, random);
