export type Status = {
  quest: { endsAt: string; presentSlots: number; totalSlots: number; resolved: boolean } | null;
  readyAt: string;
  character: { name: string; level: number; gold: number };
};

export const minutesUntil = (iso: string, now = Date.now()) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60_000));
export const bar = (filled: number, total: number) => "■".repeat(filled) + "□".repeat(Math.max(0, total - filled));

/** One line for status lines and prompts, e.g. `⚔ Quest 23m · ■■■■□□□□□ · Lv 7 · 312g`. */
export function shortStatus({ quest, readyAt, character }: Status, now = Date.now()) {
  const tail = `Lv ${character.level} · ${character.gold}g`;
  if (quest && !quest.resolved) {
    const left = minutesUntil(quest.endsAt, now);
    return `⚔ Quest ${left > 0 ? `${left}m` : "done"} · ${bar(quest.presentSlots, quest.totalSlots)} · ${tail}`;
  }
  const rest = minutesUntil(readyAt, now);
  return rest > 0 ? `Resting ${rest}m · ${tail}` : `Quest ready · ${tail}`;
}
