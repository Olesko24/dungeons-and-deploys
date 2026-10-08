import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import { authRoutes, sessionToken } from "./auth.ts";
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

const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export async function buildApp(deps: Deps, opts: FastifyServerOptions = {}) {
  const { db } = deps;
  const app = Fastify(opts);

  await app.register(cookie);
  app.addHook("onSend", async (_req, reply) => {
    reply.headers(SECURITY_HEADERS);
  });
  // Internal errors are logged, not sent: Prisma messages name tables and queries.
  app.setErrorHandler((err: { statusCode?: number }, req, reply) => {
    if (err.statusCode && err.statusCode < 500) return reply.send(err);
    req.log.error(err);
    return reply.code(500).send({ error: "internal server error" });
  });

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

  // Every successful player action may unlock achievements. Heartbeats are skipped: they are frequent and change little.
  app.addHook("onResponse", async (req, reply) => {
    if (req.method === "POST" && reply.statusCode < 400 && req.characterId && req.routeOptions.url !== "/heartbeat") {
      await trySyncProgress(db, req.characterId);
    }
  });

  // Every API route is limited per session, routes with tighter limits set their own. Static files stay outside.
  await app.register(async (api) => {
    // ponytail: in-memory rate limit store, switch to a shared store when running multiple API instances
    await api.register(rateLimit, { max: 300, timeWindow: "1 minute", keyGenerator: (req) => sessionToken(req) ?? req.ip });
    authRoutes(api, db);
    const full = { now: () => new Date(), random: Math.random, scheduleStage: async () => {}, scheduleRaid: async () => {}, scheduleDraw: async () => {}, ...deps };
    questRoutes(api, full);
    inventoryRoutes(api, db, full.random);
    encounterRoutes(api, full);
    marketRoutes(api, full);
    dungeonRoutes(api, full);
    guildRoutes(api, full);
    raidRoutes(api, full);
    shopRoutes(api, full);
    statsRoutes(api, db);
    leaderboardRoutes(api, db);
    talentRoutes(api, db);
    ideaRoutes(api, full);
    inboxRoutes(api, full);
  });

  return app;
}
