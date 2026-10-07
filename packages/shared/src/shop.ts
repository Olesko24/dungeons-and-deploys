import { type Rarity, randomItemBase } from "./items.ts";

export const SHOP_OFFERS: { rarity: Rarity; price: number; unlockLevel: number }[] = [
  { rarity: "common", price: 40, unlockLevel: 1 },
  { rarity: "rare", price: 120, unlockLevel: 1 },
  { rarity: "epic", price: 400, unlockLevel: 5 },
];

/** Small seeded generator (mulberry32), so every player sees the same offers on the same day. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UTC day like `2026-10-07`. */
export const shopDay = (t: Date) => t.toISOString().slice(0, 10);

/** The day's offers, the same for everyone. Stats are rolled per buyer on purchase. */
export function shopOffers(day: string) {
  const random = seededRandom(Number(day.replaceAll("-", "")));
  return SHOP_OFFERS.map((o) => ({ ...o, key: `${randomItemBase(random)}.${o.rarity}` }));
}
