import { type Stats, equipmentBonus } from "./items.ts";

export const MAX_LEVEL = 100;
export const RESET_GOLD_PER_POINT = 10;
/** Points a tree needs before a row opens, by row. */
export const ROW_POINTS = [0, 5, 10, 15, 20];

export const TALENT_TREES = ["offense", "defense", "luck", "general"] as const;
export type TalentTree = (typeof TALENT_TREES)[number];

/**
 * What a talent rank adds. Percent effects keep one point worth the same at level 5 and level 95,
 * which flat attack or defense would not.
 */
export type Effects = {
  /** % combat power in fights, dungeons and raids */
  power: number;
  /** % combat power in monster fights */
  fightPower: number;
  /** % combat power in dungeons and raids */
  groupPower: number;
  /** % combat power against the dungeon boss */
  bossPower: number;
  /** % raid damage */
  raidDamage: number;
  /** Percentage points on every dungeon stage */
  stageChance: number;
  /** Flat XP for a failed quest or a lost fight */
  failXp: number;
  /** Percentage points on quest and fight success, like luck on gear */
  luck: number;
  /** Percentage points on quest success */
  questLuck: number;
  /** % chance for one more rarity roll on quest and fight loot */
  rarityRoll: number;
  /** % more monster encounters */
  encounter: number;
  /** Percentage points on the quest and fight loot drop chance */
  drop: number;
  /** % more XP everywhere */
  xp: number;
  /** % more gold, like fortune on gear */
  fortune: number;
  /** % more XP from quests */
  questXp: number;
  /** % more gold from quests */
  questGold: number;
  /** % more XP from monster fights */
  fightXp: number;
  /** % more gold from monster fights */
  fightGold: number;
  /** % more XP and gold from dungeon stages */
  dungeonRewards: number;
  /** % more XP and gold from raids */
  raidRewards: number;
  /** % shorter rest after a quest */
  cooldown: number;
};
export type TalentEffect = keyof Effects;

type Talent = {
  name: string;
  tree: TalentTree;
  row: number;
  col: 0 | 1 | 2;
  max: number;
  effect: TalentEffect;
  per: number;
  /** `{v}` is replaced with the total value at a rank. */
  text: string;
  flavor: string;
  icon: string;
  /** A talent in the row right above, same column, that has to be maxed first. */
  requires?: string;
};

/** Eight talents per tree on a 3-column grid, 36 ranks each: 144 in total against 100 points at the level cap. */
export const TALENTS = {
  sharpSyntax: { name: "Sharp Syntax", tree: "offense", row: 0, col: 0, max: 5, effect: "power", per: 1, text: "+{v}% combat power", flavor: "Clean code cuts deeper.", icon: "sword" },
  quickFix: { name: "Quick Fix", tree: "offense", row: 0, col: 2, max: 5, effect: "fightPower", per: 2, text: "+{v}% combat power in monster fights", flavor: "Patch first, ask questions later.", icon: "lightning" },
  hotPath: { name: "Hot Path", tree: "offense", row: 1, col: 0, max: 5, effect: "raidDamage", per: 2, text: "+{v}% raid damage", flavor: "Profile first, then optimize.", icon: "flame" },
  bountyHunter: { name: "Bounty Hunter", tree: "offense", row: 1, col: 2, max: 5, effect: "fightGold", per: 5, text: "+{v}% gold from monster fights", flavor: "Every bug has a price on its head.", icon: "gold" },
  overclock: { name: "Overclock", tree: "offense", row: 2, col: 0, max: 5, effect: "power", per: 2, text: "+{v}% combat power", flavor: "Warranty void if removed.", icon: "chip", requires: "hotPath" },
  bossSlayer: { name: "Boss Slayer", tree: "offense", row: 2, col: 2, max: 5, effect: "bossPower", per: 3, text: "+{v}% combat power against dungeon bosses", flavor: "The Dependency Dragon fears semver.", icon: "skull" },
  hotfixFrenzy: { name: "Hotfix Frenzy", tree: "offense", row: 3, col: 1, max: 5, effect: "fightXp", per: 4, text: "+{v}% XP from monster fights", flavor: "Ship it. Ship it again. Ship it on Friday.", icon: "axe" },
  tenX: { name: "Ten-x Developer", tree: "offense", row: 4, col: 1, max: 1, effect: "power", per: 10, text: "+{v}% combat power", flavor: "Writes code faster than the linter can complain.", icon: "crown", requires: "hotfixFrenzy" },

  typeSafety: { name: "Type Safety", tree: "defense", row: 0, col: 0, max: 5, effect: "groupPower", per: 1, text: "+{v}% combat power in dungeons and raids", flavor: "The compiler has your back.", icon: "shield" },
  gracefulDegradation: { name: "Graceful Degradation", tree: "defense", row: 0, col: 2, max: 5, effect: "failXp", per: 3, text: "+{v} XP for failed quests and lost fights", flavor: "Fail, but fail politely.", icon: "heart" },
  retryPolicy: { name: "Retry Policy", tree: "defense", row: 1, col: 0, max: 5, effect: "stageChance", per: 1, text: "+{v}% chance on every dungeon stage", flavor: "If at first you don't succeed, back off exponentially.", icon: "retry" },
  circuitBreaker: { name: "Circuit Breaker", tree: "defense", row: 1, col: 2, max: 5, effect: "fightPower", per: 2, text: "+{v}% combat power in monster fights", flavor: "Fail fast, recover faster.", icon: "lock" },
  loadBalancer: { name: "Load Balancer", tree: "defense", row: 2, col: 0, max: 5, effect: "groupPower", per: 2, text: "+{v}% combat power in dungeons and raids", flavor: "Spread the load, share the glory.", icon: "helm", requires: "retryPolicy" },
  disasterRecovery: { name: "Disaster Recovery", tree: "defense", row: 2, col: 2, max: 5, effect: "raidRewards", per: 4, text: "+{v}% XP and gold from raids", flavor: "Backups are only real once you restored one.", icon: "chest" },
  redundancy: { name: "Redundancy", tree: "defense", row: 3, col: 1, max: 5, effect: "stageChance", per: 2, text: "+{v}% chance on every dungeon stage", flavor: "Two of everything, especially the coffee machine.", icon: "server" },
  zeroDowntime: { name: "Zero Downtime", tree: "defense", row: 4, col: 1, max: 1, effect: "groupPower", per: 10, text: "+{v}% combat power in dungeons and raids", flavor: "Five nines, zero excuses.", icon: "crown", requires: "redundancy" },

  luckyGuess: { name: "Lucky Guess", tree: "luck", row: 0, col: 0, max: 5, effect: "luck", per: 1, text: "+{v}% quest and fight success", flavor: "It works on my machine.", icon: "clover" },
  scavenger: { name: "Scavenger", tree: "luck", row: 0, col: 2, max: 5, effect: "drop", per: 1, text: "+{v}% loot drop chance on quests and fights", flavor: "One dev's trash is another dev's legendary.", icon: "bag" },
  goldenTicket: { name: "Golden Ticket", tree: "luck", row: 1, col: 0, max: 5, effect: "rarityRoll", per: 2, text: "+{v}% chance for an extra rarity roll on loot", flavor: "Your PR got approved without comments.", icon: "ticket" },
  bugMagnet: { name: "Bug Magnet", tree: "luck", row: 1, col: 2, max: 5, effect: "encounter", per: 10, text: "+{v}% more monster encounters", flavor: "They find you. They always find you.", icon: "magnet" },
  luckyCommit: { name: "Lucky Commit", tree: "luck", row: 2, col: 0, max: 5, effect: "rarityRoll", per: 4, text: "+{v}% chance for an extra rarity roll on loot", flavor: "Hash starts with c0ffee. Must be a sign.", icon: "star", requires: "goldenTicket" },
  rubberDuck: { name: "Rubber Duck", tree: "luck", row: 2, col: 2, max: 5, effect: "questLuck", per: 2, text: "+{v}% quest success", flavor: "Explaining the quest to the duck already solved it.", icon: "duck" },
  heisenbug: { name: "Heisenbug Whisperer", tree: "luck", row: 3, col: 1, max: 5, effect: "luck", per: 1, text: "+{v}% quest and fight success", flavor: "Bugs vanish the moment you look at them.", icon: "bug" },
  cosmicRay: { name: "Cosmic Ray", tree: "luck", row: 4, col: 1, max: 1, effect: "rarityRoll", per: 15, text: "+{v}% chance for an extra rarity roll on loot", flavor: "A single bit flip in your favor.", icon: "ring", requires: "heisenbug" },

  fastLearner: { name: "Fast Learner", tree: "general", row: 0, col: 0, max: 5, effect: "xp", per: 2, text: "+{v}% XP", flavor: "Reads the docs. All of them.", icon: "book" },
  haggler: { name: "Haggler", tree: "general", row: 0, col: 2, max: 5, effect: "fortune", per: 2, text: "+{v}% gold", flavor: "Negotiated the cloud bill down. Twice.", icon: "coins" },
  stackOverflow: { name: "Stack Overflow", tree: "general", row: 1, col: 0, max: 5, effect: "questXp", per: 5, text: "+{v}% XP from quests", flavor: "Copied from the accepted answer, not the question.", icon: "scroll" },
  expenseReport: { name: "Expense Report", tree: "general", row: 1, col: 2, max: 5, effect: "questGold", per: 5, text: "+{v}% gold from quests", flavor: "\"Team building\" covers a lot of things.", icon: "shop" },
  pairProgramming: { name: "Pair Programming", tree: "general", row: 2, col: 0, max: 5, effect: "dungeonRewards", per: 5, text: "+{v}% XP and gold from dungeon stages", flavor: "Two keyboards, one brain cell, twice the loot.", icon: "flag", requires: "stackOverflow" },
  coffeeBreak: { name: "Coffee Break", tree: "general", row: 2, col: 2, max: 5, effect: "cooldown", per: 3, text: "{v}% shorter rest after a quest", flavor: "Back in 5. Really this time.", icon: "coffee" },
  mentor: { name: "Mentor", tree: "general", row: 3, col: 1, max: 5, effect: "xp", per: 3, text: "+{v}% XP", flavor: "Teaching juniors is learning twice.", icon: "stats" },
  principal: { name: "Principal Engineer", tree: "general", row: 4, col: 1, max: 1, effect: "xp", per: 10, text: "+{v}% XP", flavor: "Promoted to someone else's problem.", icon: "crown", requires: "mentor" },
} as const satisfies Record<string, Talent>;
export type TalentKey = keyof typeof TALENTS;
export type Talents = Partial<Record<TalentKey, number>>;

export const TALENT_KEYS = Object.keys(TALENTS) as TalentKey[];

export const isTalent = (key: string): key is TalentKey => key in TALENTS;

/** One point per level, the cap included. */
export const talentPoints = (level: number) => Math.min(level, MAX_LEVEL);

export const spentPoints = (talents: Talents, tree?: TalentTree) =>
  TALENT_KEYS.filter((k) => !tree || TALENTS[k].tree === tree).reduce((sum, k) => sum + (talents[k] ?? 0), 0);

export const resetCost = (talents: Talents) => spentPoints(talents) * RESET_GOLD_PER_POINT;

/** Why the next rank of `key` cannot be learned, or null if it can. */
export function learnError(talents: Talents, key: TalentKey, level: number) {
  const t: Talent = TALENTS[key];
  if ((talents[key] ?? 0) >= t.max) return "talent maxed";
  if (spentPoints(talents) >= talentPoints(level)) return "no talent points left";
  if (spentPoints(talents, t.tree) < ROW_POINTS[t.row]) return `needs ${ROW_POINTS[t.row]} points in ${t.tree}`;
  const req = t.requires as TalentKey | undefined;
  if (req && (talents[req] ?? 0) < TALENTS[req].max) return `needs ${TALENTS[req].name} maxed`;
  return null;
}

/** The talent's effect text at a rank, or null below rank 1 or above the max. */
export function talentText(key: TalentKey, rank: number) {
  const t = TALENTS[key];
  return rank < 1 || rank > t.max ? null : t.text.replace("{v}", String(rank * t.per));
}

/** Talent effects plus `extra`, such as active guild buffs. */
export function talentBonus(talents: Talents, extra: Partial<Effects> = {}): Effects {
  const bonus = Object.fromEntries(TALENT_KEYS.map((k) => [TALENTS[k].effect, 0])) as Effects;
  for (const k of TALENT_KEYS) bonus[TALENTS[k].effect] += (talents[k] ?? 0) * TALENTS[k].per;
  for (const [effect, value] of Object.entries(extra) as [TalentEffect, number][]) bonus[effect] += value;
  return bonus;
}

/** Equipment, talents and `extra` effects together. Talent luck and fortune count like the same stats on gear. */
export function playerBonus(items: Stats[], talents: Talents, extra: Partial<Effects> = {}) {
  const t = talentBonus(talents, extra);
  const gear = equipmentBonus(items);
  return { ...t, gear: { ...gear, luck: gear.luck + t.luck, fortune: gear.fortune + t.fortune } };
}

/** `value` with `percent` more, rounded. */
export const withBonus = (value: number, percent: number) => Math.round(value * (1 + percent / 100));
