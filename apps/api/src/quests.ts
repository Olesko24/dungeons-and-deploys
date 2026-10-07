import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { COOLDOWN_MS, QUEST_MS, QUEST_SLOTS, SLOT_MS, countSlots, levelFromXp, questOutcome } from "@tokenquest/shared";
import type { Deps } from "./app.ts";
import { requireUser } from "./auth.ts";
import type { PrismaClient, Quest } from "./generated/prisma/client.ts";

async function requireCharacter(db: PrismaClient, req: FastifyRequest, reply: FastifyReply) {
  const user = await requireUser(db, req);
  if (!user) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  return db.character.findUniqueOrThrow({ where: { userId: user.id } });
}

const questView = (q: Quest) => ({
  startedAt: q.startedAt,
  endsAt: q.endsAt,
  presentSlots: countSlots(q.slots),
  totalSlots: QUEST_SLOTS,
  resolved: !!q.resolvedAt,
  success: q.success,
  xp: q.xp,
  gold: q.gold,
});

export function questRoutes(app: FastifyInstance, { db, scheduleResolve, now }: Required<Deps>) {
  app.post("/quests", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const t = now();
    const last = await db.quest.findFirst({ where: { characterId: character.id }, orderBy: { startedAt: "desc" } });
    if (last && !last.resolvedAt) return reply.code(409).send({ error: "quest already running" });
    if (last && last.endsAt.getTime() + COOLDOWN_MS > t.getTime()) {
      return reply.code(409).send({ error: "cooldown", readyAt: new Date(last.endsAt.getTime() + COOLDOWN_MS) });
    }

    // ponytail: check-then-insert can race on two parallel starts by one player, add a partial unique index if it happens
    const quest = await db.quest.create({
      data: { characterId: character.id, startedAt: t, endsAt: new Date(t.getTime() + QUEST_MS), slots: 1 },
    });
    await scheduleResolve(quest.id, quest.endsAt);
    return reply.code(201).send(questView(quest));
  });

  app.get("/quests/current", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const last = await db.quest.findFirst({ where: { characterId: character.id }, orderBy: { startedAt: "desc" } });
    return {
      quest: last ? questView(last) : null,
      readyAt: last ? new Date(last.endsAt.getTime() + COOLDOWN_MS) : now(),
    };
  });

  app.post(
    "/heartbeat",
    { config: { rateLimit: { max: 1, timeWindow: "1 minute", keyGenerator: (req) => req.headers.authorization ?? req.ip } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const t = now();
      const quest = await db.quest.findFirst({
        where: { characterId: character.id, resolvedAt: null, endsAt: { gt: t } },
      });
      if (quest) {
        const bit = 1 << Math.floor((t.getTime() - quest.startedAt.getTime()) / SLOT_MS);
        await db.$executeRaw`UPDATE quests SET slots = slots | ${bit} WHERE id = ${quest.id}`;
      }
      return reply.code(204).send();
    },
  );

  app.get("/character", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    return { name: character.name, xp: character.xp, gold: character.gold, ...levelFromXp(character.xp) };
  });
}

/** Grants the rewards of a finished quest. Safe to run twice: the second run changes nothing. */
export function resolveQuest(db: PrismaClient, questId: number, random = Math.random, t = new Date()) {
  return db.$transaction(async (tx) => {
    const quest = await tx.quest.findUnique({ where: { id: questId } });
    if (!quest || quest.resolvedAt) return null;
    const outcome = questOutcome(countSlots(quest.slots), random);
    const updated = await tx.quest.updateMany({ where: { id: questId, resolvedAt: null }, data: { ...outcome, resolvedAt: t } });
    if (updated.count === 0) return null;
    await tx.character.update({
      where: { id: quest.characterId },
      data: { xp: { increment: outcome.xp }, gold: { increment: outcome.gold } },
    });
    return outcome;
  });
}
