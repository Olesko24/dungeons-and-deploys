export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "ancient", "divine", "celestial", "eternal"] as const;
export type Rarity = (typeof RARITIES)[number];

export const ITEM_TYPES = [
  "helm", "chest", "legs", "gloves", "boots", "weapon", "shield", "twoHanded", "ring", "necklace", "earrings",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type Slot = "head" | "chest" | "legs" | "hands" | "feet" | "mainHand" | "offHand" | "ring1" | "ring2" | "neck" | "ears";

/** Slots an item type can go into. A two-handed weapon sits in `mainHand` and keeps `offHand` empty. */
export const TYPE_SLOTS: Record<ItemType, Slot[]> = {
  helm: ["head"], chest: ["chest"], legs: ["legs"], gloves: ["hands"], boots: ["feet"],
  weapon: ["mainHand"], shield: ["offHand"], twoHanded: ["mainHand"],
  ring: ["ring1", "ring2"], necklace: ["neck"], earrings: ["ears"],
};

export const STATS = ["attack", "defense", "luck", "fortune"] as const;
export type Stat = (typeof STATS)[number];
export type Stats = Record<Stat, number>;

const PRIMARY: Record<ItemType, Stat> = {
  helm: "defense", chest: "defense", legs: "defense", gloves: "defense", boots: "defense", shield: "defense",
  weapon: "attack", twoHanded: "attack", ring: "luck", necklace: "fortune", earrings: "fortune",
};

type Range = [min: number, max: number];
/** Primary stat range per rarity, lowest rarity first. */
export const PRIMARY_RANGE: Record<Stat, Range[]> = {
  attack: [[1, 3], [2, 4], [3, 6], [6, 10], [10, 15], [15, 22], [22, 32], [32, 45], [45, 62], [62, 85]],
  defense: [[1, 3], [2, 4], [3, 6], [6, 10], [10, 15], [15, 22], [22, 32], [32, 45], [45, 62], [62, 85]],
  luck: [[1, 2], [1, 3], [2, 3], [3, 5], [5, 8], [6, 9], [7, 10], [8, 12], [9, 13], [10, 15]],
  fortune: [[3, 6], [4, 8], [6, 10], [10, 15], [15, 25], [20, 30], [25, 35], [30, 42], [35, 48], [40, 55]],
};
/** Bonus stats are roughly half a primary stat of the same rarity. Common items have none. */
export const BONUS_RANGE: Record<Stat, Range[]> = {
  attack: [[0, 0], [1, 2], [1, 3], [3, 5], [5, 8], [8, 11], [11, 16], [16, 22], [22, 31], [31, 42]],
  defense: [[0, 0], [1, 2], [1, 3], [3, 5], [5, 8], [8, 11], [11, 16], [16, 22], [22, 31], [31, 42]],
  luck: [[0, 0], [1, 1], [1, 2], [2, 3], [3, 4], [3, 5], [4, 5], [4, 6], [5, 7], [5, 8]],
  fortune: [[0, 0], [2, 4], [3, 5], [5, 8], [8, 12], [10, 15], [12, 18], [15, 21], [17, 24], [20, 28]],
};
export const BONUS_COUNT = [0, 1, 1, 2, 3, 3, 3, 3, 3, 3];
export const PREFIX: Record<Stat, string> = {
  attack: "Slaughterer's", defense: "Defender's", luck: "Gambler's", fortune: "Merchant's",
};

const noStats = (): Stats => ({ attack: 0, defense: 0, luck: 0, fortune: 0 });
const rollRange = ([min, max]: Range, random: () => number) => min + Math.floor(random() * (max - min + 1));

type ArmorType = Exclude<ItemType, "weapon" | "twoHanded">;

/** One name per rarity, lowest rarity first. */
const NAMES: Record<ArmorType, string[]> = {
  helm: ["Leather Cap", "Padded Coif", "Iron Helm", "Hood of Focus", "Crown of Flow", "Mythril Circlet", "Helm of the First Commit", "Halo of Pure Functions", "Starforged Visor", "Crown of Infinite Uptime"],
  chest: ["Padded Vest", "Studded Jerkin", "Chainmail", "Cloak of Uptime", "Dragonscale Armor", "Mythril Hauberk", "Breastplate of the Mainframe", "Vestments of the Kernel", "Starweave Robe", "Armor of Five Nines"],
  legs: ["Linen Trousers", "Leather Breeches", "Chain Leggings", "Runed Legguards", "Legplates of the Long Session", "Mythril Greaves", "Greaves of the Old Codebase", "Tassets of Type Safety", "Starforged Cuisses", "Legguards of the Endless Sprint"],
  gloves: ["Work Gloves", "Leather Grips", "Iron Gauntlets", "Gloves of Swift Typing", "Gauntlets of the Merge", "Mythril Handguards", "Gauntlets of the Punch Card", "Gloves of Clean Code", "Starforged Grasp", "Gauntlets of the 10x Engineer"],
  boots: ["Worn Boots", "Traveler's Boots", "Iron Sabatons", "Boots of Hot Reload", "Treads of Zero Downtime", "Mythril Striders", "Boots of the Waterfall", "Sandals of Continuous Delivery", "Starforged Treads", "Boots of the Eternal Deploy"],
  shield: ["Wooden Buckler", "Hide Shield", "Iron Shield", "Firewall Shield", "Aegis of Rollback", "Mythril Bulwark", "Shield of the Air Gap", "Aegis of Least Privilege", "Starforged Barrier", "Bulwark of Zero Trust"],
  ring: ["Copper Ring", "Brass Band", "Silver Ring", "Ring of Caching", "Signet of Root", "Mythril Loop", "Ring of the Root Certificate", "Band of Idempotence", "Starforged Signet", "Ring of the Single Source of Truth"],
  necklace: ["Bead Necklace", "Shell Pendant", "Coin Pendant", "Token Amulet", "Golden Token", "Mythril Torc", "Amulet of the Genesis Block", "Locket of Compound Interest", "Starforged Medallion", "Pendant of the Infinite Budget"],
  earrings: ["Bone Earrings", "Brass Hoops", "Silver Studs", "Earrings of Whispered Logs", "Earrings of the Oracle", "Mythril Studs", "Earrings of the Ancient Logs", "Earrings of Perfect Observability", "Starforged Hoops", "Earrings of the All-Seeing Trace"],
};

/**
 * Weapon kinds drop in every rarity. `attack` scales the rolled attack, `signature` is a stat every
 * item of that kind rolls on top of its bonus stats. From legendary up a weapon carries its `legendary` name.
 */
export const WEAPONS = {
  dagger: { hands: 1, label: "Dagger", attack: 0.75, signature: "luck", legendary: "Dagger of the Hotfix" },
  sword: { hands: 1, label: "Sword", attack: 1, signature: null, legendary: "Blade of the Last Commit" },
  axe: { hands: 1, label: "Axe", attack: 1.25, signature: null, legendary: "Axe of Tech Debt" },
  mace: { hands: 1, label: "Mace", attack: 0.9, signature: "defense", legendary: "Mace of Merge Conflicts" },
  morningStar: { hands: 1, label: "Morning Star", attack: 1.1, signature: "fortune", legendary: "Morning Star of the Daily Standup" },
  greatsword: { hands: 2, label: "Greatsword", attack: 1, signature: null, legendary: "Greatsword of Refactoring" },
  battleAxe: { hands: 2, label: "Battle Axe", attack: 1.25, signature: null, legendary: "Battle Axe of Breaking Changes" },
  scythe: { hands: 2, label: "Scythe", attack: 1.1, signature: "luck", legendary: "Reaper of Zombie Processes" },
  spear: { hands: 2, label: "Spear", attack: 0.9, signature: "defense", legendary: "Spear of the Pull Request" },
  staff: { hands: 2, label: "Staff", attack: 0.7, signature: "fortune", legendary: "Staff of Recursion" },
  bow: { hands: 2, label: "Bow", attack: 0.85, signature: "luck", legendary: "Longbow of Long Polling" },
  crossbow: { hands: 2, label: "Crossbow", attack: 0.95, signature: "defense", legendary: "Crossbow of the Cron Job" },
} as const satisfies Record<string, { hands: 1 | 2; label: string; attack: number; signature: Stat | null; legendary: string }>;
export type WeaponKind = keyof typeof WEAPONS;
const WEAPON_KINDS = Object.keys(WEAPONS) as WeaponKind[];
/** Weapon name prefix per rarity. Up to epic it goes before the kind, from legendary up before the legendary name. */
const QUALITY = ["Worn", "Sturdy", "Fine", "Runed", "", "Mythril", "Primeval", "Hallowed", "Starforged", "Eternal"];
const LEGENDARY = RARITIES.indexOf("legendary");

export const rarityIndex = (rarity: Rarity) => RARITIES.indexOf(rarity);

/** Every base an item key can start with: armor types and weapon kinds. */
export const ITEM_BASES = [...ITEM_TYPES.filter((t) => t !== "weapon" && t !== "twoHanded"), ...WEAPON_KINDS];

/** Item keys look like `helm.rare` or `scythe.epic`. Items are defined in code, the database stores the key and rolled stats. */
export function item(key: string) {
  const [base, rarity] = key.split(".") as [string, Rarity];
  if (!RARITIES.includes(rarity)) throw new Error(`Unknown item ${key}`);
  if (base in WEAPONS) {
    const w = WEAPONS[base as WeaponKind];
    const tier = rarityIndex(rarity);
    const baseName = `${QUALITY[tier]} ${tier < LEGENDARY ? w.label : w.legendary}`.trim();
    const type: ItemType = w.hands === 2 ? "twoHanded" : "weapon";
    return { key, type, rarity, baseName, primary: "attack" as Stat, signature: w.signature as Stat | null };
  }
  const type = base as ArmorType;
  if (!(type in NAMES)) throw new Error(`Unknown item ${key}`);
  return { key, type: type as ItemType, rarity, baseName: NAMES[type][rarityIndex(rarity)], primary: PRIMARY[type], signature: null };
}

/** Rolls the primary stat, the signature stat of weapon kinds and the random bonus stats of a new item. */
export function rollStats(key: string, random: () => number): Stats {
  const { rarity, primary, signature } = item(key);
  const stats = noStats();
  const kind = key.split(".")[0] as WeaponKind;
  const tier = rarityIndex(rarity);
  const roll = rollRange(PRIMARY_RANGE[primary][tier], random);
  stats[primary] = kind in WEAPONS ? Math.max(1, Math.round(roll * WEAPONS[kind].hands * WEAPONS[kind].attack)) : roll;
  if (signature) stats[signature] = rollRange(BONUS_RANGE[signature][Math.max(1, tier)], random);
  const pool = STATS.filter((s) => s !== primary && s !== signature);
  for (let i = 0; i < BONUS_COUNT[tier] && pool.length; i++) {
    const [stat] = pool.splice(Math.floor(random() * pool.length), 1);
    stats[stat] = rollRange(BONUS_RANGE[stat][tier], random);
  }
  return stats;
}

/**
 * How good a roll is within its rarity, from 0 (every stat at its minimum) to 1 (every stat at its maximum).
 * The average position of each rolled stat in its range, weapon attack measured before the kind's multiplier.
 */
export function rollQuality(key: string, stats: Stats) {
  const { rarity, primary, signature } = item(key);
  const tier = rarityIndex(rarity);
  const kind = key.split(".")[0] as WeaponKind;
  const position = (value: number, [min, max]: Range) => (max === min ? 1 : Math.min(1, Math.max(0, (value - min) / (max - min))));
  const base = kind in WEAPONS ? stats[primary] / (WEAPONS[kind].hands * WEAPONS[kind].attack) : stats[primary];
  const scores = [position(base, PRIMARY_RANGE[primary][tier])];
  if (signature) scores.push(position(stats[signature], BONUS_RANGE[signature][Math.max(1, tier)]));
  for (const stat of STATS) {
    if (stat !== primary && stat !== signature && stats[stat]) scores.push(position(stats[stat], BONUS_RANGE[stat][tier]));
  }
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/** Name with a prefix for the strongest random bonus stat, measured against its maximum. */
export function itemName(key: string, stats: Stats) {
  const { rarity, baseName, primary, signature } = item(key);
  if (rarity === "common") return baseName;
  let best: Stat | null = null;
  let bestScore = 0;
  for (const stat of STATS) {
    if (stat === primary || stat === signature) continue;
    const score = stats[stat] / BONUS_RANGE[stat][rarityIndex(rarity)][1];
    if (score > bestScore) [best, bestScore] = [stat, score];
  }
  return best ? `${PREFIX[best]} ${baseName}` : baseName;
}

export function equipmentBonus(items: Stats[]) {
  const total = noStats();
  for (const stats of items) for (const s of STATS) total[s] += stats[s];
  return total;
}

/** Rarity weights in percent by minimum level, highest level first. Every bracket opens the next rarity. */
const LOOT_TABLE: [minLevel: number, weights: number[]][] = [
  [90, [5, 10, 18, 23, 20, 13, 6, 3, 1.5, 0.5]],
  [75, [8, 14, 21, 23, 18, 10, 4, 1.5, 0.5]],
  [60, [12, 18, 23, 22, 15, 7, 2.5, 0.5]],
  [45, [17, 22, 25, 20, 11, 4, 1]],
  [30, [26, 27, 25, 15, 6, 1]],
  [20, [38, 30, 22, 9, 1]],
  [10, [55, 28, 15, 2]],
  [5, [70, 25, 5]],
  [1, [85, 15]],
];

/** The level from which a rarity can drop. */
export const rarityLevel = (rarity: Rarity) => LOOT_TABLE.findLast(([, weights]) => weights.length > rarityIndex(rarity))![0];

export const DROP_CHANCE = 0.4;

export function rollRarity(level: number, rolls: number, random: () => number): Rarity {
  const weights = LOOT_TABLE.find(([min]) => level >= min)![1];
  let best = 0;
  for (let i = 0; i < rolls; i++) {
    let r = random() * 100;
    let index = 0;
    while (index < weights.length - 1 && r >= weights[index]) r -= weights[index++];
    best = Math.max(best, index);
  }
  return RARITIES[best];
}

/**
 * Loot after a win, or null. More rarity rolls mean better odds, the best roll counts.
 * `bonus.drop` adds percentage points to the drop chance, `bonus.rarityRoll` is the percent chance of one more roll.
 */
export function rollLoot(level: number, rarityRolls: number, random: () => number, bonus = { drop: 0, rarityRoll: 0 }) {
  if (random() >= DROP_CHANCE + bonus.drop / 100) return null;
  const extra = bonus.rarityRoll > 0 && random() < bonus.rarityRoll / 100 ? 1 : 0;
  return randomItemKey(level, rarityRolls + extra, random);
}

/** A random item: the slot type evenly, a weapon kind with the same number of hands, then the rarity. */
export function randomItemKey(level: number, rarityRolls: number, random: () => number) {
  return `${randomItemBase(random)}.${rollRarity(level, rarityRolls, random)}`;
}

/** An armor type or weapon kind, with every slot type equally likely. */
export function randomItemBase(random: () => number) {
  const type = ITEM_TYPES[Math.floor(random() * ITEM_TYPES.length)];
  if (type !== "weapon" && type !== "twoHanded") return type;
  const kinds = WEAPON_KINDS.filter((k) => WEAPONS[k].hands === (type === "weapon" ? 1 : 2));
  return kinds[Math.floor(random() * kinds.length)];
}

/**
 * Where an item goes and which equipped items have to come off for it.
 * Rings take the first free ring slot, otherwise `preferred` or ring1.
 */
export function equipPlan(equipped: { id: number; key: string; slot: Slot }[], key: string, preferred?: Slot) {
  const { type } = item(key);
  const options = TYPE_SLOTS[type];
  const taken = new Set(equipped.map((e) => e.slot));
  const slot =
    preferred && options.includes(preferred) ? preferred : (options.find((s) => !taken.has(s)) ?? options[0]);

  const blocked = new Set<Slot>([slot]);
  if (type === "twoHanded") blocked.add("offHand");
  const mainIsTwoHanded = equipped.some((e) => e.slot === "mainHand" && item(e.key).type === "twoHanded");
  if (type === "shield" && mainIsTwoHanded) blocked.add("mainHand");

  return { slot, unequip: equipped.filter((e) => blocked.has(e.slot)).map((e) => e.id) };
}
