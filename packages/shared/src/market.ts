import { type Rarity, type Stats, item, rollQuality } from "./items.ts";

/** Base value per rarity. The shop sells at twice this. */
export const MARKET_PRICES: Record<Rarity, number> = {
  common: 20, uncommon: 35, rare: 60, epic: 120, legendary: 250, mythic: 500, ancient: 900, divine: 1600, celestial: 2800, eternal: 5000,
};
export const MARKET_FEE = 0.1;
export const MARKET_MAX_PRICE = 1_000_000;
/** A new listing collects buyers this long, then one of them is drawn. Without buyers it can be bought at once. */
export const MARKET_DRAW_MS = 30 * 60 * 1000;

/** Suggested price: the rarity's base value, 75% for the weakest roll up to 125% for the best. */
export const marketValue = (key: string, stats: Stats) =>
  Math.round(MARKET_PRICES[item(key).rarity] * (0.75 + 0.5 * rollQuality(key, stats)));

export type PriceTag = "loot" | "fair" | "ripoff";
export const PRICE_TAGS: Record<PriceTag, string> = { loot: "Loot", fair: "Fair trade", ripoff: "Rip-off" };

/** A price against the suggested value: below 85% is loot, above 115% a rip-off. */
export const priceTag = (price: number, value: number): PriceTag =>
  price * 100 < value * 85 ? "loot" : price * 100 > value * 115 ? "ripoff" : "fair";

/** What the seller receives after the fee. The fee leaves the game as a gold sink. */
export const sellerPayout = (price: number) => Math.floor(price * (1 - MARKET_FEE));
