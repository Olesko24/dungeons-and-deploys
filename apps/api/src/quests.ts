import type { FastifyInstance } from "fastify";
import {
  COOLDOWN_MS,
  MIN_SLOTS_FOR_SUCCESS,
  QUEST_MS,
  QUEST_SLOTS,
  SLOT_MS,
  countSlots,
  equipmentBonus,
  levelFromXp,
  questOutcome,
  rollLoot,
  rollStats,
} from "@tokenquest/shared";
import type { Deps } from "./app.ts";
import { equippedItems, itemView, requireCharacter } from "./characters.ts";
import { encounterView, maybeSpawnEncounter } from "./encounters.ts";
import { type Character, type Item, Prisma, type PrismaClient, type Quest } from "./generated/prisma/client.ts";

const questView = (q: Quest & { lootItem?: Item | null }) => ({
  startedAt: q.startedAt,
  endsAt: q.endsAt,
  presentSlots: countSlots(q.slots),
  totalSlots: QUEST_SLOTS,
  resolved: !!q.resolvedAt,
  success: q.success,
  xp: q.xp,
  gold: q.gold,
  loot: q.lootItem ? itemView(q.lootItem) : null,
});

export function questRoutes(app: FastifyInstance, { db, scheduleResolve, now, random }: Required<Deps>) {
  app.post("/quests", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const t = now();
    const last = await db.quest.findFirst({ where: { characterId: character.id }, orderBy: { startedAt: "desc" } });
    if (last && !last.resolvedAt) return reply.code(409).send({ error: "quest already running" });
    if (last && last.endsAt.getTime() + COOLDOWN_MS > t.getTime()) {
      return reply.code(409).send({ error: "cooldown", readyAt: new Date(last.endsAt.getTime() + COOLDOWN_MS) });
    }

    // The partial unique index `quests_one_active_per_character` rejects a parallel second start.
    const quest = await db.quest
      .create({ data: { characterId: character.id, startedAt: t, endsAt: new Date(t.getTime() + QUEST_MS), slots: 1 } })
      .catch((err) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
        throw err;
      });
    if (!quest) return reply.code(409).send({ error: "quest already running" });
    await scheduleResolve(quest.id, quest.endsAt);
    return reply.code(201).send(questView(quest));
  });

  // The running quest is always the latest one, so one query serves both status and heartbeat.
  const latestQuest = (characterId: number) =>
    db.quest.findFirst({ where: { characterId }, orderBy: { startedAt: "desc" }, include: { lootItem: true } });

  const status = async (character: Character, last: (Quest & { lootItem: Item | null }) | null) => ({
    quest: last ? questView(last) : null,
    readyAt: last ? new Date(last.endsAt.getTime() + COOLDOWN_MS) : now(),
    character: { name: character.name, gold: character.gold, level: levelFromXp(character.xp).level },
    encounter: await encounterView(db, character, now()),
  });

  app.get("/quests/current", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    return status(character, await latestQuest(character.id));
  });

  app.post(
    "/heartbeat",
    { config: { rateLimit: { max: 1, timeWindow: "1 minute", keyGenerator: (req) => req.headers.authorization ?? req.ip } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const t = now();
      const last = await latestQuest(character.id);
      if (last && !last.resolvedAt && last.endsAt > t) {
        const bit = 1 << Math.floor((t.getTime() - last.startedAt.getTime()) / SLOT_MS);
        await db.$executeRaw`UPDATE quests SET slots = slots | ${bit} WHERE id = ${last.id}`;
        last.slots |= bit;
      }
      await maybeSpawnEncounter(db, character, t, random);
      return status(character, last);
    },
  );

  app.get("/character", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const equipped = await equippedItems(db, character.id);
    return { name: character.name, xp: character.xp, gold: character.gold, ...levelFromXp(character.xp), ...equipmentBonus(equipped) };
  });
}

/** Grants the rewards of a finished quest. Safe to run twice: the second run changes nothing. */
export function resolveQuest(db: PrismaClient, questId: number, random = Math.random, t = new Date()) {
  return db.$transaction(async (tx) => {
    const quest = await tx.quest.findUnique({
      where: { id: questId },
      include: { character: { include: { items: { where: { equippedSlot: { not: null } } } } } },
    });
    if (!quest || quest.resolvedAt) return null;

    const { character } = quest;
    const present = countSlots(quest.slots);
    const { luck, fortune } = equipmentBonus(character.items);
    const outcome = questOutcome(present, random, luck, fortune);
    const loot = outcome.success ? rollLoot(levelFromXp(character.xp).level, present, MIN_SLOTS_FOR_SUCCESS, random) : null;

    const updated = await tx.quest.updateMany({ where: { id: questId, resolvedAt: null }, data: { ...outcome, resolvedAt: t } });
    if (updated.count === 0) return null;
    await tx.character.update({
      where: { id: character.id },
      data: { xp: { increment: outcome.xp }, gold: { increment: outcome.gold } },
    });
    if (!loot) return { ...outcome, loot: null };
    const lootItem = await tx.item.create({ data: { characterId: character.id, key: loot, ...rollStats(loot, random) } });
    await tx.quest.update({ where: { id: questId }, data: { lootItemId: lootItem.id } });
    return { ...outcome, loot: itemView(lootItem) };
  });
}
