import type { FastifyInstance } from "fastify";
import { ACHIEVEMENTS, type PlayerStats, RARITIES, type Talents, item, levelFromXp, playerBonus, playerPower, rarityIndex } from "@dnd/shared";
import { requireCharacter } from "./characters.ts";
import { notify } from "./inbox.ts";
import type { Character, PrismaClient } from "./generated/prisma/client.ts";

const LEGENDARY_UP = RARITIES.slice(rarityIndex("legendary"));

/**
 * Counted from existing tables, nothing is tracked twice, except the quest streak kept on the character.
 * Counts and sums run in the database, so the cost stays flat however long a player's history gets.
 */
export async function playerStats(db: PrismaClient, c: Character): Promise<PlayerStats> {
  const id = c.id;
  // Loot a character found, wherever the item is now.
  const looted = { OR: [{ foundIn: { characterId: id } }, { wonIn: { characterId: id } }, { dungeonLoot: { characterId: id } }, { raidLoot: { characterId: id } }] };
  const [quests, encounters, dungeonGold, cleared, raidsWon, itemsFound, legendariesFound, equipped, marketSold, marketBought, shopBought, guild] =
    await Promise.all([
      db.quest.groupBy({ by: ["success"], where: { characterId: id, resolvedAt: { not: null } }, _count: true, _sum: { gold: true } }),
      db.encounter.groupBy({ by: ["won", "monster"], where: { characterId: id, foughtAt: { not: null } }, _count: true, _sum: { gold: true } }),
      db.dungeonMember.aggregate({ where: { characterId: id }, _sum: { gold: true } }),
      db.dungeonMember.findMany({
        where: { characterId: id, dungeon: { success: true } },
        select: { dungeon: { select: { _count: { select: { members: true } } } } },
      }),
      db.raidMember.count({ where: { characterId: id, raid: { state: "won" }, damage: { gt: 0 } } }),
      db.item.count({ where: looted }),
      db.item.count({ where: { AND: [looted, { OR: LEGENDARY_UP.map((r) => ({ key: { endsWith: `.${r}` } })) }] } }),
      db.item.findMany({ where: { characterId: id, equippedSlot: { not: null } }, select: { key: true } }),
      db.marketDraw.count({ where: { sellerId: id } }),
      db.marketDraw.count({ where: { buyerId: id } }),
      db.shopPurchase.count({ where: { characterId: id } }),
      db.guildMember.findUnique({ where: { characterId: id } }),
    ]);
  const count = <T extends { _count: number }>(rows: T[], keep: (r: T) => boolean) => rows.filter(keep).reduce((s, r) => s + r._count, 0);
  const gold = (rows: { _sum: { gold: number | null } }[]) => rows.reduce((s, r) => s + (r._sum.gold ?? 0), 0);
  return {
    level: levelFromXp(c.xp).level,
    questsWon: count(quests, (q) => q.success === true),
    questsFailed: count(quests, (q) => q.success === false),
    longestStreak: c.bestQuestStreak,
    goldEarned: gold(quests) + gold(encounters) + (dungeonGold._sum.gold ?? 0),
    monstersSlain: count(encounters, (e) => e.won === true),
    fightsLost: count(encounters, (e) => e.won === false),
    dragonsSlain: count(encounters, (e) => e.won === true && e.monster === "dependencyDragon"),
    itemsFound,
    legendariesFound,
    // A two-handed weapon fills the off hand too.
    equippedSlots: equipped.length + equipped.filter((i) => item(i.key).type === "twoHanded").length,
    dungeonsCleared: cleared.length,
    fullPartyClears: cleared.filter((d) => d.dungeon._count.members >= 5).length,
    raidsWon,
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
  const known = new Set((await db.achievement.findMany({ where: { characterId } })).map((a) => a.key));
  const unlocked = ACHIEVEMENTS.filter((a) => !known.has(a.key) && a.done(stats));
  if (unlocked.length) {
    // skipDuplicates covers a parallel sync, which then notifies twice at worst.
    await db.achievement.createMany({ data: unlocked.map((a) => ({ characterId, key: a.key })), skipDuplicates: true });
    for (const a of unlocked) await notify(db, [characterId], "achievement", `Achievement unlocked: ${a.name}. ${a.description}.`);
  }
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
