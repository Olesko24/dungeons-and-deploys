import { PrismaPg } from "@prisma/adapter-pg";
import { PgBoss } from "pg-boss";
import { buildApp } from "./app.ts";
import { PrismaClient } from "./generated/prisma/client.ts";
import { startJobs } from "./jobs.ts";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env("DATABASE_URL") }) });
const boss = new PgBoss(env("DATABASE_URL"));
const jobs = await startJobs(boss, db);
const app = await buildApp(
  { db, ...jobs },
  {
    // Runs behind the Coolify proxy, client IPs for rate limiting come from X-Forwarded-For.
    // Only proxies on the private Docker network are trusted, so a client reaching the port directly cannot fake its IP.
    trustProxy: "loopback, uniquelocal",
    // Request logs leave out the client IP, so logs hold no personal data beyond what the URL contains.
    logger: { serializers: { req: (req) => ({ method: req.method, url: req.url }) } },
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await app.close();
    await boss.stop();
    await db.$disconnect();
  });
}

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
