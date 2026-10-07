import type { Effects } from "./talents.ts";

export const GUILD_BUFF_MS = 24 * 60 * 60 * 1000;

/** Bought by the guild leader from the guild bank, active for every member. Better buffs need a higher guild level. */
export const GUILD_BUFFS = {
  standupSnacks: { name: "Standup Snacks", text: "+10% XP", effect: "xp", value: 10, cost: 300, level: 1, flavor: "Nobody skips a standup with donuts." },
  bonusRound: { name: "Bonus Round", text: "+10% gold", effect: "fortune", value: 10, cost: 300, level: 1, flavor: "Finance approved it. Do not ask how." },
  warRoom: { name: "War Room", text: "+5% combat power", effect: "power", value: 5, cost: 500, level: 3, flavor: "Whiteboards, energy drinks, one shared goal." },
  sharedCache: { name: "Shared Cache", text: "+5% loot drop chance", effect: "drop", value: 5, cost: 500, level: 5, flavor: "Why fetch loot twice?" },
  asyncStandup: { name: "Async Standup", text: "15% shorter rest after a quest", effect: "cooldown", value: 15, cost: 800, level: 8, flavor: "Post your update and get back to work." },
} as const satisfies Record<string, { name: string; text: string; effect: keyof Effects; value: number; cost: number; level: number; flavor: string }>;
export type GuildBuffKey = keyof typeof GUILD_BUFFS;

export const isGuildBuff = (key: string): key is GuildBuffKey => key in GUILD_BUFFS;

/** The effects of active buffs, in the shape talents use. */
export function buffEffects(keys: string[]): Partial<Effects> {
  const effects: Partial<Effects> = {};
  for (const key of keys.filter(isGuildBuff)) effects[GUILD_BUFFS[key].effect] = (effects[GUILD_BUFFS[key].effect] ?? 0) + GUILD_BUFFS[key].value;
  return effects;
}

/** The guild bank gets 10% of a quest's gold on top, at least 1 for a successful quest. Players keep their full reward. */
export const guildShare = (questGold: number) => (questGold > 0 ? Math.max(1, Math.round(questGold * 0.1)) : 0);
