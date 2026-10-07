import type { FastifyInstance } from "fastify";
import {
  COOLDOWN_MS,
  QUEST_LOOT_ROLLS,
  type Talents,
  equipmentBonus,
  levelFromXp,
  playerBonus,
  questName,
  questOutcome,
  questStory,
  rollLoot,
  rollStats,
  talentBonus,
  withBonus,
} from "@tokenquest/shared";
import type { Deps } from "./app.ts";
import { equippedItems, itemView, requireCharacter } from "./characters.ts";
import { SESSION_COOKIE } from "./auth.ts";
import { dungeonView } from "./dungeons.ts";
import { encounterView, maybeSpawnEncounter } from "./encounters.ts";
import { type Character, type Item, Prisma, type PrismaClient, type Quest } from "./generated/prisma/client.ts";

const questView = (q: Quest & { lootItem?: Item | null }) => ({
  name: questName(q.id),
  story: q.resolvedAt ? questStory(q.id, q.success) : null,
  startedAt: q.startedAt,
  endsAt: q.endsAt,
  resolved: !!q.resolvedAt,
  success: q.success,
  xp: q.xp,
  gold: q.gold,
  loot: q.lootItem ? itemView(q.lootItem) : null,
});

const cooldownMs = (character: Character) => COOLDOWN_MS * (1 - talentBonus(character.talents as Talents).cooldown / 100);

export function questRoutes(app: FastifyInstance, { db, now, random }: Required<Deps>) {
  app.post("/quests", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const t = now();
    const result = await db.$transaction(async (tx) => {
      // Locks the character, so a parallel start waits and then runs into the cooldown.
      await tx.$queryRaw`SELECT id FROM characters WHERE id = ${character.id} FOR UPDATE`;
      const last = await tx.quest.findFirst({ where: { characterId: character.id }, orderBy: { startedAt: "desc" } });
      if (last && !last.resolvedAt) return { error: "quest already running" };
      const cooldown = cooldownMs(character);
      if (last && last.endsAt.getTime() + cooldown > t.getTime()) {
        return { error: "cooldown", readyAt: new Date(last.endsAt.getTime() + cooldown) };
      }
      const quest = await tx.quest.create({ data: { characterId: character.id, startedAt: t, endsAt: t } });
      const outcome = await grantQuest(tx, quest.id, random, t);
      return { name: questName(quest.id), story: questStory(quest.id, outcome?.success ?? null), ...outcome, readyAt: new Date(t.getTime() + cooldown) };
    });
    return reply.code("error" in result ? 409 : 201).send(result);
  });

  // The running quest is always the latest one, so one query serves both status and heartbeat.
  const latestQuest = (characterId: number) =>
    db.quest.findFirst({ where: { characterId }, orderBy: { startedAt: "desc" }, include: { lootItem: true } });

  const status = async (character: Character, last: (Quest & { lootItem: Item | null }) | null) => ({
    quest: last ? questView(last) : null,
    readyAt: last ? new Date(last.endsAt.getTime() + cooldownMs(character)) : now(),
    character: { name: character.name, gold: character.gold, level: levelFromXp(character.xp).level },
    encounter: await encounterView(db, character, now()),
    dungeon: await dungeonView(db, character.id, now()),
  });

  app.get("/quests/current", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    return status(character, await latestQuest(character.id));
  });

  // Heartbeats from the terminal, Claude Code or an open website tab can spawn monsters and refresh the status.
  // Quests, dungeons and raids do not depend on them.
  app.post(
    "/heartbeat",
    {
      config: {
        rateLimit: { max: 1, timeWindow: "1 minute", keyGenerator: (req) => req.headers.authorization ?? req.cookies[SESSION_COOKIE] ?? req.ip },
      },
    },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      await maybeSpawnEncounter(db, character, now(), random);
      return status(character, await latestQuest(character.id));
    },
  );

  app.get("/quests/history", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const quests = await db.quest.findMany({
      where: { characterId: character.id, resolvedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { lootItem: true },
    });
    return quests.map(questView);
  });

  app.get("/character", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const equipped = await equippedItems(db, character.id);
    return {
      name: character.name,
      xp: character.xp,
      gold: character.gold,
      tour: character.tour,
      ...levelFromXp(character.xp),
      ...equipmentBonus(equipped),
    };
  });
}

/** Grants the rewards of a finished quest. Safe to run twice: the second run changes nothing. */
export function resolveQuest(db: PrismaClient, questId: number, random = Math.random, t = new Date()) {
  return db.$transaction((tx) => grantQuest(tx, questId, random, t));
}

async function grantQuest(tx: Prisma.TransactionClient, questId: number, random: () => number, t: Date) {
  const quest = await tx.quest.findUnique({
    where: { id: questId },
    include: { character: { include: { items: { where: { equippedSlot: { not: null } } } } } },
  });
  if (!quest || quest.resolvedAt) return null;

  const { character } = quest;
  const bonus = playerBonus(character.items, character.talents as Talents);
  const outcome = questOutcome(random, bonus.gear.luck + bonus.questLuck, bonus.gear.fortune + bonus.questGold);
  outcome.xp = withBonus(outcome.success ? outcome.xp : outcome.xp + bonus.failXp, bonus.xp + bonus.questXp);
  const loot = outcome.success ? rollLoot(levelFromXp(character.xp).level, QUEST_LOOT_ROLLS, random, bonus) : null;

  const updated = await tx.quest.updateMany({ where: { id: questId, resolvedAt: null }, data: { ...outcome, resolvedAt: t } });
  if (updated.count === 0) return null;
  await tx.character.update({
    where: { id: character.id },
    data: { xp: { increment: outcome.xp }, gold: { increment: outcome.gold } },
  });
  const membership = await tx.guildMember.findUnique({ where: { characterId: character.id } });
  if (membership) await tx.guild.update({ where: { id: membership.guildId }, data: { xp: { increment: outcome.xp } } });
  if (!loot) return { ...outcome, loot: null };
  const lootItem = await tx.item.create({ data: { characterId: character.id, key: loot, ...rollStats(loot, random) } });
  await tx.quest.update({ where: { id: questId }, data: { lootItemId: lootItem.id } });
  return { ...outcome, loot: itemView(lootItem) };
}
