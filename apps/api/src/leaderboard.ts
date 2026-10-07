import type { FastifyInstance } from "fastify";
import { guildLevel, levelFromXp } from "@dnd/shared";
import { requireCharacter } from "./characters.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";

const BOARDS = ["xp", "achievements", "guilds"] as const;
type Board = (typeof BOARDS)[number];
const TOP = 20;

type Row = { rank: number; name: string; value: number; level?: number };

const notBanned = { user: { bannedAt: null } };

async function board(db: PrismaClient, name: Board, characterId: number): Promise<{ top: Row[]; you: Row | null }> {
  if (name === "xp") {
    const top = await db.character.findMany({ where: notBanned, orderBy: [{ xp: "desc" }, { id: "asc" }], take: TOP });
    const me = await db.character.findUniqueOrThrow({ where: { id: characterId } });
    const ahead = await db.character.count({ where: { ...notBanned, xp: { gt: me.xp } } });
    const row = (c: typeof me, rank: number) => ({ rank, name: c.name, value: c.xp, level: levelFromXp(c.xp).level });
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

  const top = await db.guild.findMany({ orderBy: [{ xp: "desc" }, { id: "asc" }], take: TOP });
  const membership = await db.guildMember.findUnique({ where: { characterId }, include: { guild: true } });
  const row = (g: { name: string; xp: number }, rank: number) => ({ rank, name: g.name, value: g.xp, level: guildLevel(g.xp).level });
  const you = membership ? row(membership.guild, (await db.guild.count({ where: { xp: { gt: membership.guild.xp } } })) + 1) : null;
  return { top: top.map((g, i) => row(g, i + 1)), you };
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
}
