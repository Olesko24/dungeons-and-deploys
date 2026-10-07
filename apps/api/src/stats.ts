import type { FastifyInstance } from "fastify";
import { QUEST_SLOTS, type PlayerStats, achievementsFor, countSlots, item, levelFromXp } from "@tokenquest/shared";
import { requireCharacter } from "./characters.ts";
import type { Character, PrismaClient } from "./generated/prisma/client.ts";

const PERFECT = (1 << QUEST_SLOTS) - 1;

/** Everything is counted from existing tables, nothing is tracked twice. */
export async function playerStats(db: PrismaClient, c: Character): Promise<PlayerStats> {
  const id = c.id;
  const [quests, encounters, dungeons, raids, equipped, marketSold, marketBought, shopBought, guild] = await Promise.all([
    db.quest.findMany({ where: { characterId: id, resolvedAt: { not: null } }, select: { slots: true, success: true, gold: true, lootItem: true } }),
    db.encounter.findMany({ where: { characterId: id, foughtAt: { not: null } }, select: { won: true, monster: true, gold: true, lootItem: true } }),
    db.dungeonMember.findMany({
      where: { characterId: id },
      select: { gold: true, lootItem: true, dungeon: { select: { success: true, _count: { select: { members: true } } } } },
    }),
    db.raidMember.findMany({ where: { characterId: id, raid: { state: "won" }, damage: { gt: 0 } }, select: { lootItem: true } }),
    db.item.findMany({ where: { characterId: id, equippedSlot: { not: null } }, select: { key: true } }),
    db.marketDraw.count({ where: { sellerId: id } }),
    db.marketDraw.count({ where: { buyerId: id } }),
    db.shopPurchase.count({ where: { characterId: id } }),
    db.guildMember.findUnique({ where: { characterId: id } }),
  ]);
  const loot = [...quests, ...encounters, ...dungeons, ...raids].flatMap((r) => (r.lootItem ? [r.lootItem.key] : []));
  const sum = (rows: { gold: number }[]) => rows.reduce((s, r) => s + r.gold, 0);
  return {
    level: levelFromXp(c.xp).level,
    questsWon: quests.filter((q) => q.success).length,
    questsFailed: quests.filter((q) => !q.success).length,
    perfectQuests: quests.filter((q) => q.success && q.slots === PERFECT).length,
    presentSlots: quests.reduce((s, q) => s + countSlots(q.slots), 0),
    goldEarned: sum(quests) + sum(encounters) + sum(dungeons),
    monstersSlain: encounters.filter((e) => e.won).length,
    fightsLost: encounters.filter((e) => !e.won).length,
    dragonsSlain: encounters.filter((e) => e.won && e.monster === "dependencyDragon").length,
    itemsFound: loot.length,
    legendariesFound: loot.filter((k) => k.endsWith(".legendary")).length,
    // A two-handed weapon fills the off hand too.
    equippedSlots: equipped.length + equipped.filter((i) => item(i.key).type === "twoHanded").length,
    dungeonsCleared: dungeons.filter((d) => d.dungeon.success).length,
    fullPartyClears: dungeons.filter((d) => d.dungeon.success && d.dungeon._count.members >= 5).length,
    raidsWon: raids.length,
    marketSold,
    marketBought,
    shopBought,
    guildFounder: guild?.role === "leader",
  };
}

export function statsRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get("/stats", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const stats = await playerStats(db, character);
    return { stats, achievements: achievementsFor(stats) };
  });
}
