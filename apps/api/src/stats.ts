import type { FastifyInstance } from "fastify";
import { ACHIEVEMENTS, QUEST_SLOTS, type PlayerStats, countSlots, item, levelFromXp } from "@tokenquest/shared";
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

/** Stores achievements whose condition holds now. Stored ones stay unlocked even if the condition is lost later. */
export async function syncAchievements(db: PrismaClient, characterId: number) {
  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character) return null;
  const stats = await playerStats(db, character);
  const unlocked = ACHIEVEMENTS.filter((a) => a.done(stats)).map((a) => ({ characterId, key: a.key }));
  if (unlocked.length) await db.achievement.createMany({ data: unlocked, skipDuplicates: true });
  return stats;
}

/** For callers that must not fail because of achievements: a missed sync is caught up on the next action. */
export async function trySyncAchievements(db: PrismaClient, characterId: number) {
  try {
    await syncAchievements(db, characterId);
  } catch (err) {
    console.error(`Achievement sync failed for character ${characterId}`, err);
  }
}

export function statsRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get("/stats", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const stats = await syncAchievements(db, character.id);
    const stored = await db.achievement.findMany({ where: { characterId: character.id } });
    const unlockedAt = new Map(stored.map((a) => [a.key, a.unlockedAt]));
    return {
      stats,
      achievements: ACHIEVEMENTS.map(({ key, name, description }) => ({ key, name, description, unlockedAt: unlockedAt.get(key) ?? null })),
    };
  });
}
