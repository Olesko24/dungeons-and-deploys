import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import { authRoutes } from "./auth.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";
import type { SendMail } from "./mail.ts";
import { questRoutes } from "./quests.ts";

export type Deps = {
  db: PrismaClient;
  sendMail: SendMail;
  publicUrl: string;
  scheduleResolve: (questId: number, at: Date) => Promise<unknown>;
  now?: () => Date;
};

export async function buildApp(deps: Deps, opts: FastifyServerOptions = {}) {
  const { db, sendMail, publicUrl } = deps;
  const app = Fastify(opts);

  // ponytail: in-memory rate limit store, switch to a shared store when running multiple API instances
  await app.register(rateLimit, { global: false });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) =>
    done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );

  app.get("/health", async (_req, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return reply.code(503).send("database unavailable");
    }
  });

  authRoutes(app, db, sendMail, publicUrl);
  questRoutes(app, { now: () => new Date(), ...deps });

  return app;
}
