import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import { authRoutes } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { encounterRoutes } from "./encounters.ts";
import { inventoryRoutes } from "./inventory.ts";
import { marketRoutes } from "./market.ts";
import { questRoutes } from "./quests.ts";

export type Deps = {
  db: PrismaClient;
  scheduleResolve: (questId: number, at: Date) => Promise<unknown>;
  now?: () => Date;
  random?: () => number;
};

export async function buildApp(deps: Deps, opts: FastifyServerOptions = {}) {
  const { db } = deps;
  const app = Fastify(opts);

  // ponytail: in-memory rate limit store, switch to a shared store when running multiple API instances
  await app.register(rateLimit, { global: false });

  app.get("/health", async (_req, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return reply.code(503).send("database unavailable");
    }
  });

  authRoutes(app, db);
  const full = { now: () => new Date(), random: Math.random, ...deps };
  questRoutes(app, full);
  inventoryRoutes(app, db);
  encounterRoutes(app, full);
  marketRoutes(app, full);

  return app;
}
