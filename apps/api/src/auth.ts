import { createHash, randomBytes, randomInt } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Prisma, type PrismaClient } from "./generated/prisma/client.ts";

const PAIR_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function randomCode(length: number) {
  return Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

const normalizeCode = (code: string) => code.trim().toUpperCase();

async function createSession(db: Prisma.TransactionClient, userId: number) {
  const token = `tq_${randomBytes(32).toString("base64url")}`;
  await db.session.create({ data: { tokenHash: hash(token), userId } });
  return token;
}

export async function requireUser(db: PrismaClient, req: FastifyRequest) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  return session?.user ?? null;
}

export function authRoutes(app: FastifyInstance, db: PrismaClient) {
  app.post<{ Body: { code: string; name: string } }>(
    "/auth/register",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["code", "name"],
          properties: { code: { type: "string" }, name: { type: "string", pattern: "^[a-zA-Z0-9_-]{2,20}$" } },
        },
      },
    },
    async (req, reply) => {
      const result = await db
        .$transaction(async (tx) => {
          const consumed = await tx.accessCode.updateMany({
            where: {
              code: normalizeCode(req.body.code),
              uses: { lt: tx.accessCode.fields.maxUses },
              expiresAt: { gt: new Date() },
            },
            data: { uses: { increment: 1 } },
          });
          if (consumed.count === 0) return { error: "invalid or used-up access code" };
          const user = await tx.user.create({ data: { character: { create: { name: req.body.name } } } });
          return { token: await createSession(tx, user.id) };
        })
        .catch((err) => {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { error: "name taken" };
          throw err;
        });
      if ("error" in result) return reply.code(result.error === "name taken" ? 409 : 400).send(result);
      return result;
    },
  );

  app.post("/auth/pair", async (req, reply) => {
    const user = await requireUser(db, req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const code = `${randomCode(4)}-${randomCode(4)}`;
    const expiresAt = new Date(Date.now() + PAIR_TTL_MS);
    await db.pairCode.create({ data: { codeHash: hash(code), userId: user.id, expiresAt } });
    return { code, expiresAt };
  });

  app.post<{ Body: { code: string } }>(
    "/auth/pair/redeem",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: { body: { type: "object", required: ["code"], properties: { code: { type: "string" } } } },
    },
    async (req, reply) => {
      const codeHash = hash(normalizeCode(req.body.code));
      const token = await db.$transaction(async (tx) => {
        const pair = await tx.pairCode.findUnique({ where: { codeHash } });
        // Deleting inside the transaction makes the code single-use.
        const deleted = await tx.pairCode.deleteMany({ where: { codeHash } });
        if (!pair || deleted.count === 0 || pair.expiresAt < new Date()) return null;
        return createSession(tx, pair.userId);
      });
      if (!token) return reply.code(400).send({ error: "invalid or expired pair code" });
      return { token };
    },
  );
}
