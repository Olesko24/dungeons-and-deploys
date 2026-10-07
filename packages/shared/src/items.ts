export const RARITIES = ["common", "rare", "epic", "legendary"] as const;
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
export const PRIMARY_RANGE: Record<Stat, Record<Rarity, Range>> = {
  attack: { common: [1, 3], rare: [3, 6], epic: [6, 10], legendary: [10, 15] },
  defense: { common: [1, 3], rare: [3, 6], epic: [6, 10], legendary: [10, 15] },
  luck: { common: [1, 2], rare: [2, 3], epic: [3, 5], legendary: [5, 8] },
  fortune: { common: [3, 6], rare: [6, 10], epic: [10, 15], legendary: [15, 25] },
};
/** Bonus stats are roughly half a primary stat of the same rarity. Common items have none. */
export const BONUS_RANGE: Record<Stat, Record<Exclude<Rarity, "common">, Range>> = {
  attack: { rare: [1, 3], epic: [3, 5], legendary: [5, 8] },
  defense: { rare: [1, 3], epic: [3, 5], legendary: [5, 8] },
  luck: { rare: [1, 2], epic: [2, 3], legendary: [3, 4] },
  fortune: { rare: [3, 5], epic: [5, 8], legendary: [8, 12] },
};
export const BONUS_COUNT: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
export const PREFIX: Record<Stat, string> = {
  attack: "Slaughterer's", defense: "Defender's", luck: "Gambler's", fortune: "Merchant's",
};

const noStats = (): Stats => ({ attack: 0, defense: 0, luck: 0, fortune: 0 });
const rollRange = ([min, max]: Range, random: () => number) => min + Math.floor(random() * (max - min + 1));

type ArmorType = Exclude<ItemType, "weapon" | "twoHanded">;

const NAMES: Record<ArmorType, [string, string, string, string]> = {
  helm: ["Leather Cap", "Iron Helm", "Hood of Focus", "Crown of Flow"],
  chest: ["Padded Vest", "Chainmail", "Cloak of Uptime", "Dragonscale Armor"],
  legs: ["Linen Trousers", "Chain Leggings", "Runed Legguards", "Legplates of the Long Session"],
  gloves: ["Work Gloves", "Iron Gauntlets", "Gloves of Swift Typing", "Gauntlets of the Merge"],
  boots: ["Worn Boots", "Iron Sabatons", "Boots of Hot Reload", "Treads of Zero Downtime"],
  shield: ["Wooden Buckler", "Iron Shield", "Firewall Shield", "Aegis of Rollback"],
  ring: ["Copper Ring", "Silver Ring", "Ring of Caching", "Signet of Root"],
  necklace: ["Bead Necklace", "Coin Pendant", "Token Amulet", "Golden Token"],
  earrings: ["Bone Earrings", "Silver Studs", "Earrings of Whispered Logs", "Earrings of the Oracle"],
};

/**
 * Weapon kinds drop in every rarity. `attack` scales the rolled attack, `signature` is a stat every
 * item of that kind rolls on top of its bonus stats.
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
const QUALITY: Record<Exclude<Rarity, "legendary">, string> = { common: "Worn", rare: "Fine", epic: "Runed" };

/** Every base an item key can start with: armor types and weapon kinds. */
export const ITEM_BASES = [...ITEM_TYPES.filter((t) => t !== "weapon" && t !== "twoHanded"), ...WEAPON_KINDS];

/** Item keys look like `helm.rare` or `scythe.epic`. Items are defined in code, the database stores the key and rolled stats. */
export function item(key: string) {
  const [base, rarity] = key.split(".") as [string, Rarity];
  if (!RARITIES.includes(rarity)) throw new Error(`Unknown item ${key}`);
  if (base in WEAPONS) {
    const w = WEAPONS[base as WeaponKind];
    const baseName = rarity === "legendary" ? w.legendary : `${QUALITY[rarity]} ${w.label}`;
    const type: ItemType = w.hands === 2 ? "twoHanded" : "weapon";
    return { key, type, rarity, baseName, primary: "attack" as Stat, signature: w.signature as Stat | null };
  }
  const type = base as ArmorType;
  if (!(type in NAMES)) throw new Error(`Unknown item ${key}`);
  return { key, type: type as ItemType, rarity, baseName: NAMES[type][RARITIES.indexOf(rarity)], primary: PRIMARY[type], signature: null };
}

/** Rolls the primary stat, the signature stat of weapon kinds and the random bonus stats of a new item. */
export function rollStats(key: string, random: () => number): Stats {
  const { rarity, primary, signature } = item(key);
  const stats = noStats();
  const kind = key.split(".")[0] as WeaponKind;
  const roll = rollRange(PRIMARY_RANGE[primary][rarity], random);
  stats[primary] = kind in WEAPONS ? Math.max(1, Math.round(roll * WEAPONS[kind].hands * WEAPONS[kind].attack)) : roll;
  if (signature) stats[signature] = rollRange(BONUS_RANGE[signature][rarity === "common" ? "rare" : rarity], random);
  if (rarity === "common") return stats;
  const pool = STATS.filter((s) => s !== primary && s !== signature);
  for (let i = 0; i < BONUS_COUNT[rarity] && pool.length; i++) {
    const [stat] = pool.splice(Math.floor(random() * pool.length), 1);
    stats[stat] = rollRange(BONUS_RANGE[stat][rarity], random);
  }
  return stats;
}

/** Name with a prefix for the strongest random bonus stat, measured against its maximum. */
export function itemName(key: string, stats: Stats) {
  const { rarity, baseName, primary, signature } = item(key);
  if (rarity === "common") return baseName;
  let best: Stat | null = null;
  let bestScore = 0;
  for (const stat of STATS) {
    if (stat === primary || stat === signature) continue;
    const score = stats[stat] / BONUS_RANGE[stat][rarity][1];
    if (score > bestScore) [best, bestScore] = [stat, score];
  }
  return best ? `${PREFIX[best]} ${baseName}` : baseName;
}

export function equipmentBonus(items: Stats[]) {
  const total = noStats();
  for (const stats of items) for (const s of STATS) total[s] += stats[s];
  return total;
}

/** Rarity weights in percent by minimum level, highest level first. */
const LOOT_TABLE: [minLevel: number, weights: [number, number, number, number]][] = [
  [25, [40, 35, 19, 6]],
  [15, [50, 33, 13, 4]],
  [10, [59, 30, 9, 2]],
  [5, [74.5, 22, 3, 0.5]],
  [2, [89.4, 10, 0.5, 0.1]],
  [1, [90, 10, 0, 0]],
];

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

/** Loot after a win, or null. More rarity rolls mean better odds, the best roll counts. */
export function rollLoot(level: number, rarityRolls: number, random: () => number) {
  if (random() >= DROP_CHANCE) return null;
  return randomItemKey(level, rarityRolls, random);
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
