import type { FastifyInstance } from "fastify";
import type { Deps } from "./app.ts";
import { requireCharacter } from "./characters.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";

export const IDEA_STATUSES = ["open", "planned", "done", "rejected"] as const;
export const IDEAS_PER_DAY = 3;

const startOfDay = (t: Date) => new Date(t.toISOString().slice(0, 10));

/** Open and planned ideas first, by votes. Done and rejected ones follow. */
async function ideaList(db: PrismaClient, characterId: number, t: Date) {
  const ideas = await db.idea.findMany({
    include: { author: true, votes: { select: { characterId: true } } },
    orderBy: { id: "asc" },
  });
  const rank = (status: string) => (status === "done" ? 1 : status === "rejected" ? 2 : 0);
  const submitted = await db.idea.count({ where: { authorId: characterId, createdAt: { gte: startOfDay(t) } } });
  return {
    left: Math.max(0, IDEAS_PER_DAY - submitted),
    ideas: ideas
      .map((i) => ({
        id: i.id,
        title: i.title,
        text: i.text,
        status: i.status,
        author: i.author.name,
        votes: i.votes.length,
        voted: i.votes.some((v) => v.characterId === characterId),
        createdAt: i.createdAt,
      }))
      .sort((a, b) => rank(a.status) - rank(b.status) || b.votes - a.votes),
  };
}

export function ideaRoutes(app: FastifyInstance, { db, now }: Required<Deps>) {
  app.get("/ideas", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    return ideaList(db, character.id, now());
  });

  app.post<{ Body: { title: string; text?: string } }>(
    "/ideas",
    {
      schema: {
        body: {
          type: "object",
          required: ["title"],
          properties: { title: { type: "string", minLength: 3, maxLength: 80 }, text: { type: "string", maxLength: 500 } },
        },
      },
    },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const title = req.body.title.trim();
      if (title.length < 3) return reply.code(400).send({ error: "the title needs at least 3 characters" });
      const t = now();
      const submitted = await db.idea.count({ where: { authorId: character.id, createdAt: { gte: startOfDay(t) } } });
      if (submitted >= IDEAS_PER_DAY) return reply.code(429).send({ error: `${IDEAS_PER_DAY} ideas a day, come back tomorrow` });
      await db.idea.create({ data: { authorId: character.id, title, text: req.body.text?.trim() ?? "", createdAt: t } });
      return reply.code(201).send(await ideaList(db, character.id, t));
    },
  );

  /** Votes for the idea, or takes the vote back. */
  app.post<{ Params: { id: string } }>("/ideas/:id/vote", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const ideaId = Number(req.params.id);
    if (!Number.isInteger(ideaId) || !(await db.idea.findUnique({ where: { id: ideaId } }))) {
      return reply.code(404).send({ error: "no such idea" });
    }
    const key = { ideaId_characterId: { ideaId, characterId: character.id } };
    const removed = await db.ideaVote.deleteMany({ where: { ideaId, characterId: character.id } });
    if (removed.count === 0) await db.ideaVote.upsert({ where: key, create: { ideaId, characterId: character.id }, update: {} });
    return ideaList(db, character.id, now());
  });
}
