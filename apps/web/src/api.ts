export type Stats = { attack: number; defense: number; luck: number; fortune: number };
export type Item = { id: number; key: string; name: string; type: string; rarity: string; stats: Stats; equippedSlot: string | null; listed: boolean };
export type Quest = {
  name: string;
  story: string | null;
  startedAt: string;
  endsAt: string;
  resolved: boolean;
  success: boolean | null;
  xp: number;
  gold: number;
  loot: Item | null;
};
export type Character = Stats & { name: string; xp: number; gold: number; tour: "new" | "skipped" | "done"; level: number; xpIntoLevel: number; xpForNext: number; power: number };
export type Status = {
  quest: Quest | null;
  readyAt: string;
  encounter: { name: string; level: number; expiresAt: string; winChance: number; power: number; recommended: number } | null;
  dungeon: { code: string; state: string; story: string; startsAt: string; cleared: number; current: string | null; stageEndsAt: string | null; members: string[]; power: number[]; recommended: number[] } | null;
};

export type Guild = {
  name: string;
  code: string;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  gold: number;
  members: { name: string; role: string; level: number; donated: number }[];
  buffs: { key: string; name: string; text: string; flavor: string; cost: number; level: number; unlocked: boolean; endsAt: string | null }[];
};

export type Raid = {
  boss: string;
  tier: number;
  recommended: number;
  state: "scheduled" | "running" | "won" | "failed" | "cancelled";
  story: string;
  startsAt: string;
  endsAt: string;
  tick: number;
  ticks: number;
  bossHp: number;
  bossMaxHp: number;
  minPlayers: number;
  members: { name: string; damage: number }[];
};

export type RaidBoss = { tier: number; name: string; flavor: string; recommended: number; unlocked: boolean };
export type Raids = { raid: Raid | null; bosses: RaidBoss[]; power: number };

export type ShopOffer = { offer: number; key: string; name: string; rarity: string; stats: Stats; price: number; unlockLevel: number; locked: boolean; bought: boolean };
export type Shop = { gold: number; refreshesAt: string; offers: ShopOffer[] };
export type Market = { gold: number; drawsLeft: number; offers: { rarity: string; price: number; available: number; unlockLevel: number; unlocked: boolean }[] };
export type Talent = {
  key: string;
  name: string;
  tree: string;
  row: number;
  col: number;
  flavor: string;
  rank: number;
  max: number;
  rowPoints: number;
  requires: string | null;
  current: string | null;
  next: string | null;
  error: string | null;
};
export type TalentSheet = { points: number; spent: number; resetCost: number; gold: number; trees: { tree: string; spent: number }[]; talents: Talent[] };
export type Achievement = { key: string; name: string; description: string; unlockedAt: string | null };
export type PlayerStats = Record<string, number | boolean>;

export type RankRow = { rank: number; name: string; value: number; level?: number; members?: number; power?: number };
export type Leaderboard = { board: string; top: RankRow[]; you: RankRow | null };

export class Unauthorized extends Error {}

/** Same-origin calls, the session lives in an httpOnly cookie. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new Unauthorized();
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.error ?? data?.message ?? `Request failed (${res.status})`);
  return data as T;
}
