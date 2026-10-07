import { PgBoss } from "pg-boss";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { resolveStage, stageEndsAt } from "./dungeons.ts";
import { resolveQuest } from "./quests.ts";

export async function startJobs(boss: PgBoss, db: PrismaClient) {
  await boss.start();
  await boss.createQueue("quest.resolve");
  await boss.createQueue("pair-codes.cleanup");
  await boss.createQueue("dungeon.stage");

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

  return {
    scheduleResolve: (questId: number, at: Date) => boss.send("quest.resolve", { questId }, { startAfter: at }),
    scheduleStage,
  };
}
