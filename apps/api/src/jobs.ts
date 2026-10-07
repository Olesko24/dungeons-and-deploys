import { PgBoss } from "pg-boss";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { resolveStage, stageEndsAt } from "./dungeons.ts";
import { resolveQuest } from "./quests.ts";
import { advanceRaid, raidTickAt } from "./raids.ts";

export async function startJobs(boss: PgBoss, db: PrismaClient) {
  await boss.start();
  await boss.createQueue("quest.resolve");
  await boss.createQueue("pair-codes.cleanup");
  await boss.createQueue("dungeon.stage");
  await boss.createQueue("raid.tick");

  await boss.work<{ questId: number }>("quest.resolve", async (jobs) => {
    for (const job of jobs) await resolveQuest(db, job.data.questId);
  });
  await boss.work("pair-codes.cleanup", () => db.pairCode.deleteMany({ where: { expiresAt: { lt: new Date() } } }));
  await boss.schedule("pair-codes.cleanup", "0 * * * *");

  const scheduleStage = (dungeonId: number, stage: number, at: Date) =>
    boss.send("dungeon.stage", { dungeonId, stage }, { startAfter: at });
  await boss.work<{ dungeonId: number; stage: number }>("dungeon.stage", async (jobs) => {
    for (const { data } of jobs) {
      const result = await resolveStage(db, data.dungeonId, data.stage);
      if (!result?.next) continue;
      const dungeon = await db.dungeon.findUniqueOrThrow({ where: { id: data.dungeonId } });
      await scheduleStage(data.dungeonId, data.stage + 1, stageEndsAt(dungeon.startsAt, data.stage + 1));
    }
  });

  const scheduleRaid = (raidId: number, tick: number, at: Date) => boss.send("raid.tick", { raidId, tick }, { startAfter: at });
  await boss.work<{ raidId: number; tick: number }>("raid.tick", async (jobs) => {
    for (const { data } of jobs) {
      const result = await advanceRaid(db, data.raidId, data.tick);
      if (!result?.next) continue;
      const raid = await db.raid.findUniqueOrThrow({ where: { id: data.raidId } });
      await scheduleRaid(data.raidId, data.tick + 1, raidTickAt(raid.startsAt, data.tick + 1));
    }
  });

  return {
    scheduleRaid,
    scheduleResolve: (questId: number, at: Date) => boss.send("quest.resolve", { questId }, { startAfter: at }),
    scheduleStage,
  };
}
