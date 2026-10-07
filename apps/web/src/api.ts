export type Stats = { attack: number; defense: number; luck: number; fortune: number };
export type Item = { id: number; key: string; name: string; type: string; rarity: string; stats: Stats; equippedSlot: string | null; listed: boolean };
export type Quest = {
  startedAt: string;
  endsAt: string;
  presentSlots: number;
  totalSlots: number;
  resolved: boolean;
  success: boolean | null;
  xp: number;
  gold: number;
  loot: Item | null;
};
export type Character = Stats & { name: string; xp: number; gold: number; level: number; xpIntoLevel: number; xpForNext: number };
export type Status = {
  quest: Quest | null;
  readyAt: string;
  encounter: { name: string; level: number; expiresAt: string; winChance: number } | null;
  dungeon: { code: string; state: string; startsAt: string; cleared: number; current: string | null; stageEndsAt: string | null; members: string[] } | null;
};

export type Guild = {
  name: string;
  code: string;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  members: { name: string; role: string; level: number }[];
};

export type Raid = {
  boss: string;
  state: "scheduled" | "running" | "won" | "failed" | "cancelled";
  startsAt: string;
  endsAt: string;
  tick: number;
  ticks: number;
  bossHp: number;
  bossMaxHp: number;
  minPlayers: number;
  members: { name: string; damage: number }[];
};

export type ShopOffer = { offer: number; key: string; name: string; rarity: string; price: number; unlockLevel: number; locked: boolean; bought: boolean };
export type Shop = { gold: number; refreshesAt: string; offers: ShopOffer[] };
export type Achievement = { key: string; name: string; description: string; unlockedAt: string | null };
export type PlayerStats = Record<string, number | boolean>;

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
