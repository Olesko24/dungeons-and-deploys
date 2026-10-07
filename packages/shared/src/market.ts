import type { Rarity } from "./items.ts";

export const MARKET_PRICES: Record<Rarity, number> = { common: 20, rare: 60, epic: 200, legendary: 800 };
export const MARKET_UNLOCK_LEVEL: Record<Rarity, number> = { common: 1, rare: 1, epic: 5, legendary: 10 };
export const MARKET_DAILY_DRAWS = 1;
export const MARKET_FEE = 0.1;

/** What the seller receives after the fee. The fee leaves the game as a gold sink. */
export const sellerPayout = (rarity: Rarity) => Math.floor(MARKET_PRICES[rarity] * (1 - MARKET_FEE));
