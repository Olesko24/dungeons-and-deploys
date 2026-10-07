export type PlayerStats = {
  level: number;
  questsWon: number;
  questsFailed: number;
  perfectQuests: number;
  presentSlots: number;
  goldEarned: number;
  monstersSlain: number;
  fightsLost: number;
  dragonsSlain: number;
  itemsFound: number;
  legendariesFound: number;
  equippedSlots: number;
  dungeonsCleared: number;
  fullPartyClears: number;
  raidsWon: number;
  marketSold: number;
  marketBought: number;
  shopBought: number;
  guildFounder: boolean;
};

/** Achievements are derived from stats on every read, they carry no reward. */
export const ACHIEVEMENTS: { key: string; name: string; description: string; done: (s: PlayerStats) => boolean }[] = [
  { key: "firstQuest", name: "First Steps", description: "Finish a quest", done: (s) => s.questsWon >= 1 },
  { key: "quests10", name: "Regular", description: "Finish 10 quests", done: (s) => s.questsWon >= 10 },
  { key: "quests100", name: "Veteran", description: "Finish 100 quests", done: (s) => s.questsWon >= 100 },
  { key: "quests500", name: "Legend of the Terminal", description: "Finish 500 quests", done: (s) => s.questsWon >= 500 },
  { key: "perfect", name: "Full Presence", description: "Finish a quest with all 9 slots present", done: (s) => s.perfectQuests >= 1 },
  { key: "firstBlood", name: "First Blood", description: "Defeat a monster", done: (s) => s.monstersSlain >= 1 },
  { key: "bugHunter", name: "Bug Hunter", description: "Defeat 50 monsters", done: (s) => s.monstersSlain >= 50 },
  { key: "dragon", name: "Dependency Resolved", description: "Defeat a Dependency Dragon", done: (s) => s.dragonsSlain >= 1 },
  { key: "legendary", name: "Lucky Strike", description: "Find a legendary item", done: (s) => s.legendariesFound >= 1 },
  { key: "fullSet", name: "Fully Equipped", description: "Fill every equipment slot", done: (s) => s.equippedSlots >= 11 },
  { key: "dungeon", name: "Dungeon Crawler", description: "Clear a dungeon", done: (s) => s.dungeonsCleared >= 1 },
  { key: "party", name: "Party of Five", description: "Clear a dungeon with a full party", done: (s) => s.fullPartyClears >= 1 },
  { key: "raid", name: "Raid Night", description: "Win a guild raid", done: (s) => s.raidsWon >= 1 },
  { key: "merchant", name: "Merchant", description: "Sell an item on the market", done: (s) => s.marketSold >= 1 },
  { key: "shopper", name: "Window Shopper", description: "Buy something in the shop", done: (s) => s.shopBought >= 1 },
  { key: "founder", name: "Founder", description: "Lead a guild", done: (s) => s.guildFounder },
  { key: "senior", name: "Senior", description: "Reach level 10", done: (s) => s.level >= 10 },
  { key: "principal", name: "Principal", description: "Reach level 25", done: (s) => s.level >= 25 },
];

export const achievementsFor = (stats: PlayerStats) =>
  ACHIEVEMENTS.map(({ done, ...a }) => ({ ...a, unlocked: done(stats) }));
