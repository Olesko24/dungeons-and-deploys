import type { FastifyInstance } from "fastify";
import { levelFromXp } from "@dnd/shared";
import type { Deps } from "./app.ts";
import { requireCharacter } from "./characters.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";

export type NotificationKind = "market" | "dungeon" | "raid" | "guild" | "achievement";
export const INBOX_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** Adds the same line to the inbox of every given character. */
export async function notify(db: Pick<PrismaClient, "notification">, characterIds: number[], kind: NotificationKind, text: string) {
  if (characterIds.length) await db.notification.createMany({ data: characterIds.map((characterId) => ({ characterId, kind, text })) });
}

/** " You reached level 12!" when the XP crossed a level, otherwise empty. */
export const levelUpNote = (xpBefore: number, xpAfter: number) => {
  const level = levelFromXp(xpAfter).level;
  return level > levelFromXp(xpBefore).level ? ` You reached level ${level}!` : "";
};

export const unreadCount = (db: PrismaClient, characterId: number, seenAt: Date) =>
  db.notification.count({ where: { characterId, createdAt: { gt: seenAt } } });

export function inboxRoutes(app: FastifyInstance, { db }: Required<Deps>) {
  /** The newest 100 entries. Reading the inbox marks everything as read. */
  app.get("/inbox", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const rows = await db.notification.findMany({ where: { characterId: character.id }, orderBy: { id: "desc" }, take: 100 });
    // Marked read up to the newest entry shown, so one arriving meanwhile stays unread.
    if (rows[0]) await db.character.update({ where: { id: character.id }, data: { inboxSeenAt: rows[0].createdAt } });
    return {
      notifications: rows.map((n) => ({ id: n.id, kind: n.kind, text: n.text, createdAt: n.createdAt, unread: n.createdAt > character.inboxSeenAt })),
    };
  });

  app.post<{ Params: { id: string } }>("/inbox/delete/:id", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    await db.notification.deleteMany({ where: { id: Number(req.params.id) || 0, characterId: character.id } });
    return reply.code(204).send();
  });

  app.post("/inbox/clear", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    await db.notification.deleteMany({ where: { characterId: character.id } });
    return reply.code(204).send();
  });
}
