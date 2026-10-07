import type { FastifyInstance } from "fastify";
import { ACHIEVEMENTS, type PlayerStats, type Talents, item, levelFromXp, playerBonus, playerPower } from "@dnd/shared";
import { requireCharacter } from "./characters.ts";
import type { Character, PrismaClient } from "./generated/prisma/client.ts";

/** Most successful quests in a row. */
function longestStreak(quests: { success: boolean | null }[]) {
  let best = 0;
  let run = 0;
  for (const q of quests) {
    run = q.success ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Everything is counted from existing tables, nothing is tracked twice. */
export async function playerStats(db: PrismaClient, c: Character): Promise<PlayerStats> {
  const id = c.id;
  const [quests, encounters, dungeons, raids, equipped, marketSold, marketBought, shopBought, guild] = await Promise.all([
    db.quest.findMany({
      where: { characterId: id, resolvedAt: { not: null } },
      orderBy: { startedAt: "asc" },
      select: { success: true, gold: true, lootItem: true },
    }),
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
    longestStreak: longestStreak(quests),
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
    tourDone: c.tour === "done",
  };
}

/**
 * Runs after every player action and job. Stores achievements whose condition holds now, which stay
 * unlocked even if the condition is lost later, and the combat power for the leaderboard.
 */
export async function syncProgress(db: PrismaClient, characterId: number) {
  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character) return null;
  const items = await db.item.findMany({ where: { characterId, equippedSlot: { not: null } } });
  const { level } = levelFromXp(character.xp);
  const bonus = playerBonus(items, character.talents as Talents);
  const power = playerPower(level, bonus.gear, bonus.power);
  if (power !== character.power) await db.character.update({ where: { id: characterId }, data: { power } });
  const stats = await playerStats(db, character);
  const unlocked = ACHIEVEMENTS.filter((a) => a.done(stats)).map((a) => ({ characterId, key: a.key }));
  if (unlocked.length) await db.achievement.createMany({ data: unlocked, skipDuplicates: true });
  return stats;
}

/** For callers that must not fail because of the sync: a missed one is caught up on the next action. */
export async function trySyncProgress(db: PrismaClient, characterId: number) {
  try {
    await syncProgress(db, characterId);
  } catch (err) {
    console.error(`Progress sync failed for character ${characterId}`, err);
  }
}

export function statsRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get("/stats", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const stats = await syncProgress(db, character.id);
    const stored = await db.achievement.findMany({ where: { characterId: character.id } });
    const unlockedAt = new Map(stored.map((a) => [a.key, a.unlockedAt]));
    return {
      stats,
      achievements: ACHIEVEMENTS.map(({ key, name, description }) => ({ key, name, description, unlockedAt: unlockedAt.get(key) ?? null })),
    };
  });

  /** Ends the website tour. Skipping never undoes a finished tour, so its achievement condition stays true. */
  app.post<{ Body: { done: boolean } }>(
    "/tour",
    { schema: { body: { type: "object", required: ["done"], properties: { done: { type: "boolean" } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      await db.character.updateMany({
        where: { id: character.id, ...(req.body.done ? {} : { tour: { not: "done" } }) },
        data: { tour: req.body.done ? "done" : "skipped" },
      });
      return { tour: (await db.character.findUniqueOrThrow({ where: { id: character.id } })).tour };
    },
  );
}
