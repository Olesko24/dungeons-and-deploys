import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import { authRoutes } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import { dungeonRoutes } from "./dungeons.ts";
import { encounterRoutes } from "./encounters.ts";
import { guildRoutes } from "./guilds.ts";
import { ideaRoutes } from "./ideas.ts";
import { inboxRoutes } from "./inbox.ts";
import { inventoryRoutes } from "./inventory.ts";
import { leaderboardRoutes } from "./leaderboard.ts";
import { marketRoutes } from "./market.ts";
import { questRoutes } from "./quests.ts";
import { raidRoutes } from "./raids.ts";
import { shopRoutes } from "./shop.ts";
import { statsRoutes, trySyncProgress } from "./stats.ts";
import { talentRoutes } from "./talents.ts";

export type Deps = {
  db: PrismaClient;
  scheduleStage?: (dungeonId: number, stage: number, at: Date) => Promise<unknown>;
  scheduleRaid?: (raidId: number, tick: number, at: Date) => Promise<unknown>;
  scheduleDraw?: (itemId: number, at: Date) => Promise<unknown>;
  now?: () => Date;
  random?: () => number;
};

export async function buildApp(deps: Deps, opts: FastifyServerOptions = {}) {
  const { db } = deps;
  const app = Fastify(opts);

  // ponytail: in-memory rate limit store, switch to a shared store when running multiple API instances
  await app.register(rateLimit, { global: false });
  await app.register(cookie);

  // The website is a static SPA built into apps/web/dist. Unknown GET routes fall back to its index.html.
  const web = new URL("../../web/dist/", import.meta.url);
  if (existsSync(web)) {
    await app.register(fastifyStatic, { root: web.pathname, wildcard: false });
    app.setNotFoundHandler((req, reply) =>
      req.method === "GET" && req.headers.accept?.includes("text/html")
        ? reply.sendFile("index.html")
        : reply.code(404).send({ error: "not found" }),
    );
  }

  app.get("/health", async (_req, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return reply.code(503).send("database unavailable");
    }
  });

  authRoutes(app, db);
  const full = { now: () => new Date(), random: Math.random, scheduleStage: async () => {}, scheduleRaid: async () => {}, scheduleDraw: async () => {}, ...deps };
  questRoutes(app, full);
  inventoryRoutes(app, db, full.random);
  encounterRoutes(app, full);
  marketRoutes(app, full);
  dungeonRoutes(app, full);
  guildRoutes(app, full);
  raidRoutes(app, full);
  shopRoutes(app, full);
  statsRoutes(app, db);
  leaderboardRoutes(app, db);
  talentRoutes(app, db);
  ideaRoutes(app, full);
  inboxRoutes(app, full);

  // Every successful player action may unlock achievements. Heartbeats are skipped: they are frequent and change little.
  app.addHook("onResponse", async (req, reply) => {
    if (req.method === "POST" && reply.statusCode < 400 && req.characterId && req.routeOptions.url !== "/heartbeat") {
      await trySyncProgress(db, req.characterId);
    }
  });

  return app;
}
