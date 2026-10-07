import { PgBoss } from "pg-boss";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { resolveQuest } from "./quests.ts";

export async function startJobs(boss: PgBoss, db: PrismaClient) {
  await boss.start();
  await boss.createQueue("quest.resolve");
  await boss.createQueue("pair-codes.cleanup");

  await boss.work<{ questId: number }>("quest.resolve", async (jobs) => {
    for (const job of jobs) await resolveQuest(db, job.data.questId);
  });
  await boss.work("pair-codes.cleanup", () => db.pairCode.deleteMany({ where: { expiresAt: { lt: new Date() } } }));
  await boss.schedule("pair-codes.cleanup", "0 * * * *");

  return (questId: number, at: Date) => boss.send("quest.resolve", { questId }, { startAfter: at });
}
