import Fastify, { type FastifyServerOptions } from "fastify";

type Db = { $queryRaw(query: TemplateStringsArray): Promise<unknown> };

export function buildApp(db: Db, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  app.get("/health", async (_req, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return reply.code(503).send("database unavailable");
    }
  });

  return app;
}
