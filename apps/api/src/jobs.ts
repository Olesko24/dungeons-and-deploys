import { PgBoss } from "pg-boss";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { resolveStage, stageEndsAt } from "./dungeons.ts";
import { INBOX_KEEP_MS } from "./inbox.ts";
import { resolveMarketDraw } from "./market.ts";
import { resolveQuest } from "./quests.ts";
import { advanceRaid, raidTickAt } from "./raids.ts";
import { trySyncProgress } from "./stats.ts";

/**
 * Follow-up jobs are planned from the stored state, not from what the resolve call returned. A retried job finds
 * its step already done and still plans the next one. The singleton key keeps a step from being planned twice.
 */
export async function startJobs(boss: PgBoss, db: PrismaClient) {
  const syncMembers = async (members: { characterId: number }[]) => {
    for (const m of members) await trySyncProgress(db, m.characterId);
  };

  await boss.start();
  await boss.createQueue("quest.resolve");
  await boss.createQueue("pair-codes.cleanup");
  await boss.createQueue("dungeon.stage");
  await boss.createQueue("raid.tick");
  await boss.createQueue("market.draw");
  await boss.createQueue("inbox.cleanup");

  // ponytail: only drains quests started before quests resolved at once, remove once none are left unresolved
  await boss.work<{ questId: number }>("quest.resolve", async (jobs) => {
    for (const job of jobs) {
      await resolveQuest(db, job.data.questId);
      const quest = await db.quest.findUnique({ where: { id: job.data.questId } });
      if (quest) await trySyncProgress(db, quest.characterId);
    }
  });
  await boss.work("pair-codes.cleanup", () => db.pairCode.deleteMany({ where: { expiresAt: { lt: new Date() } } }));
  await boss.schedule("pair-codes.cleanup", "0 * * * *");
  await boss.work("inbox.cleanup", () => db.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - INBOX_KEEP_MS) } } }));
  await boss.schedule("inbox.cleanup", "30 3 * * *");

  const scheduleDraw = (itemId: number, at: Date) =>
    boss.upsert("market.draw", { itemId }, { startAfter: at, singletonKey: `market-${itemId}-${at.getTime()}` });
  await boss.work<{ itemId: number }>("market.draw", async (jobs) => {
    for (const { data } of jobs) {
      const drawn = await resolveMarketDraw(db, data.itemId);
      if (drawn) await syncMembers([{ characterId: drawn.sellerId }, { characterId: drawn.winnerId }]);
    }
  });

  const scheduleStage = (dungeonId: number, stage: number, at: Date) =>
    boss.upsert("dungeon.stage", { dungeonId, stage }, { startAfter: at, singletonKey: `dungeon-${dungeonId}-${stage}` });
  await boss.work<{ dungeonId: number; stage: number }>("dungeon.stage", async (jobs) => {
    for (const { data } of jobs) {
      await resolveStage(db, data.dungeonId, data.stage);
      const dungeon = await db.dungeon.findUnique({ where: { id: data.dungeonId }, include: { members: true } });
      if (!dungeon) continue;
      if (dungeon.endedAt) await syncMembers(dungeon.members);
      else if (dungeon.stage === data.stage + 1) {
        await scheduleStage(dungeon.id, dungeon.stage, stageEndsAt(dungeon.startsAt, dungeon.stage));
      }
    }
  });

  const scheduleRaid = (raidId: number, tick: number, at: Date) =>
    boss.upsert("raid.tick", { raidId, tick }, { startAfter: at, singletonKey: `raid-${raidId}-${tick}` });
  await boss.work<{ raidId: number; tick: number }>("raid.tick", async (jobs) => {
    for (const { data } of jobs) {
      await advanceRaid(db, data.raidId, data.tick);
      const raid = await db.raid.findUnique({ where: { id: data.raidId }, include: { members: true } });
      if (!raid) continue;
      if (raid.state === "won") await syncMembers(raid.members);
      else if (raid.state === "running" && raid.tick === data.tick) {
        await scheduleRaid(raid.id, raid.tick + 1, raidTickAt(raid.startsAt, raid.tick + 1));
      }
    }
  });

  return {
    scheduleDraw,
    scheduleRaid,
    scheduleStage,
  };
}
