import type { FastifyInstance } from "fastify";
import { equipmentBonus, guildLevel, levelFromXp } from "@dnd/shared";
import { equippedItems, itemView, requireCharacter } from "./characters.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";

const BOARDS = ["xp", "power", "achievements", "guilds"] as const;
type Board = (typeof BOARDS)[number];
const TOP = 20;

type Row = { rank: number; name: string; value: number; level?: number; members?: number; power?: number };

const notBanned = { user: { bannedAt: null } };

async function board(db: PrismaClient, name: Board, characterId: number): Promise<{ top: Row[]; you: Row | null }> {
  // Both are stored on the character: XP directly, combat power by syncProgress after every action.
  if (name === "xp" || name === "power") {
    const top = await db.character.findMany({ where: notBanned, orderBy: [{ [name]: "desc" }, { id: "asc" }], take: TOP });
    const me = await db.character.findUniqueOrThrow({ where: { id: characterId } });
    const ahead = await db.character.count({ where: { ...notBanned, [name]: { gt: me[name] } } });
    const row = (c: typeof me, rank: number) => ({ rank, name: c.name, value: c[name], level: levelFromXp(c.xp).level });
    return { top: top.map((c, i) => row(c, i + 1)), you: row(me, ahead + 1) };
  }

  if (name === "achievements") {
    const counts = await db.achievement.groupBy({
      by: ["characterId"],
      where: { character: notBanned },
      _count: { _all: true },
      orderBy: [{ _count: { characterId: "desc" } }, { characterId: "asc" }],
    });
    const names = new Map(
      (await db.character.findMany({ where: { id: { in: counts.slice(0, TOP).map((c) => c.characterId) } } })).map((c) => [c.id, c.name]),
    );
    const top = counts.slice(0, TOP).map((c, i) => ({ rank: i + 1, name: names.get(c.characterId) ?? "?", value: c._count._all }));
    const mine = counts.findIndex((c) => c.characterId === characterId);
    const me = await db.character.findUniqueOrThrow({ where: { id: characterId } });
    // ponytail: ranks all players in memory, switch to a SQL window function once there are many thousands with achievements
    return { top, you: mine >= 0 ? { rank: mine + 1, name: me.name, value: counts[mine]._count._all } : null };
  }

  // Every guild with its size and average combat power, so players can compare them before joining.
  // ponytail: lists all guilds, page or cap it once there are hundreds
  const guilds = await db.guild.findMany({
    orderBy: [{ xp: "desc" }, { id: "asc" }],
    include: { members: { select: { characterId: true, character: { select: { power: true } } } } },
  });
  const top = guilds.map((g, i) => ({
    rank: i + 1,
    name: g.name,
    value: g.xp,
    level: guildLevel(g.xp).level,
    members: g.members.length,
    power: Math.round(g.members.reduce((sum, m) => sum + m.character.power, 0) / Math.max(1, g.members.length)),
  }));
  return { top, you: top.find((_, i) => guilds[i].members.some((m) => m.characterId === characterId)) ?? null };
}

export function leaderboardRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get<{ Querystring: { board?: Board } }>(
    "/leaderboard",
    { schema: { querystring: { type: "object", properties: { board: { type: "string", enum: [...BOARDS] } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const name = req.query.board ?? "xp";
      return { board: name, ...(await board(db, name, character.id)) };
    },
  );

  /** What every player can see of another: level, combat power, stats and equipment. Gold and the bag stay private. */
  app.get<{ Params: { name: string } }>("/profile/:name", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const target = await db.character.findFirst({
      where: { name: req.params.name, ...notBanned },
      include: { guild: { include: { guild: true } }, _count: { select: { achievements: true } } },
    });
    if (!target) return reply.code(404).send({ error: "no player with that name" });
    const equipped = await equippedItems(db, target.id);
    return {
      name: target.name,
      ...levelFromXp(target.xp),
      xp: target.xp,
      power: target.power,
      stats: equipmentBonus(equipped),
      equipment: equipped.map(itemView),
      guild: target.guild?.guild.name ?? null,
      achievements: target._count.achievements,
      mine: target.id === character.id,
    };
  });
}
