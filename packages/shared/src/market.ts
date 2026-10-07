import { RARITIES, type Rarity, rarityLevel } from "./items.ts";

export const MARKET_PRICES: Record<Rarity, number> = {
  common: 20, uncommon: 35, rare: 60, epic: 120, legendary: 250, mythic: 500, ancient: 900, divine: 1600, celestial: 2800, eternal: 5000,
};
/** A rarity's draws unlock at the level it starts to drop. */
export const MARKET_UNLOCK_LEVEL = Object.fromEntries(RARITIES.map((r) => [r, rarityLevel(r)])) as Record<Rarity, number>;
export const MARKET_DAILY_DRAWS = 1;
export const MARKET_FEE = 0.1;

/** What the seller receives after the fee. The fee leaves the game as a gold sink. */
export const sellerPayout = (rarity: Rarity) => Math.floor(MARKET_PRICES[rarity] * (1 - MARKET_FEE));
