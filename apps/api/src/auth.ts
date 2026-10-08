import { createHash, randomBytes, randomInt } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { playerPower } from "@dnd/shared";
import { Prisma, type PrismaClient } from "./generated/prisma/client.ts";

const PAIR_TTL_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const NO_GEAR = { attack: 0, defense: 0, luck: 0, fortune: 0 };
export const SESSION_COOKIE = "tq_session";
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

function redeemPairCode(db: PrismaClient, code: string) {
  const codeHash = hash(normalizeCode(code));
  return db.$transaction(async (tx) => {
    const pair = await tx.pairCode.findUnique({ where: { codeHash } });
    // Deleting inside the transaction makes the code single-use.
    const deleted = await tx.pairCode.deleteMany({ where: { codeHash } });
    if (!pair || deleted.count === 0 || pair.expiresAt < new Date()) return null;
    return createSession(tx, pair.userId);
  });
}

/** The token a request logs in with: the CLI's bearer token, else the website's cookie. Rate limits key on it too. */
export const sessionToken = (req: FastifyRequest) => req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? req.cookies[SESSION_COOKIE];

export async function requireUser(db: PrismaClient, req: FastifyRequest) {
  const token = sessionToken(req);
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  if (!session || session.createdAt.getTime() < Date.now() - SESSION_TTL_MS) return null;
  return session.user.bannedAt ? null : session.user;
}

/** Uses up one access code and creates the player. A taken name keeps the code's use. */
function register(db: PrismaClient, code: string, name: string) {
  return db
    .$transaction(async (tx) => {
      const consumed = await tx.accessCode.updateMany({
        where: { codeHash: hash(normalizeCode(code)), uses: { lt: tx.accessCode.fields.maxUses }, expiresAt: { gt: new Date() } },
        data: { uses: { increment: 1 } },
      });
      if (consumed.count === 0) return { error: "invalid or used-up access code" };
      const user = await tx.user.create({ data: { character: { create: { name, power: playerPower(1, NO_GEAR) } } } });
      return { token: await createSession(tx, user.id) };
    })
    .catch((err): { error: string } => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { error: "name taken" };
      throw err;
    });
}

const registerOptions = {
  config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  schema: {
    body: {
      type: "object",
      required: ["code", "name"],
      properties: { code: { type: "string" }, name: { type: "string", pattern: "^[a-zA-Z0-9_-]{2,20}$" } },
    },
  },
};

/** The website keeps its token in an httpOnly cookie instead of handing it to the page. */
function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function authRoutes(app: FastifyInstance, db: PrismaClient) {
  app.post<{ Body: { code: string; name: string } }>("/auth/register", registerOptions, async (req, reply) => {
    const result = await register(db, req.body.code, req.body.name);
    if ("error" in result) return reply.code(result.error === "name taken" ? 409 : 400).send(result);
    return result;
  });

  app.post<{ Body: { code: string; name: string } }>("/auth/web/register", registerOptions, async (req, reply) => {
    const result = await register(db, req.body.code, req.body.name);
    if ("error" in result) return reply.code(result.error === "name taken" ? 409 : 400).send(result);
    setSessionCookie(reply, result.token);
    return reply.code(204).send();
  });

  app.post("/auth/pair", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      const token = await redeemPairCode(db, req.body.code);
      if (!token) return reply.code(400).send({ error: "invalid or expired pair code" });
      return { token };
    },
  );

  // The website logs in with a pair code too.
  app.post<{ Body: { code: string } }>(
    "/auth/web",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: { body: { type: "object", required: ["code"], properties: { code: { type: "string" } } } },
    },
    async (req, reply) => {
      const token = await redeemPairCode(db, req.body.code);
      if (!token) return reply.code(400).send({ error: "invalid or expired pair code" });
      setSessionCookie(reply, token);
      return reply.code(204).send();
    },
  );

  /** Ends this session, or with `all` every session of the player, e.g. after losing a device. */
  app.post<{ Body: { all?: boolean } | undefined }>(
    "/auth/logout",
    { schema: { body: { type: ["object", "null"], properties: { all: { type: "boolean" } } } } },
    async (req, reply) => {
      const token = sessionToken(req);
      if (token && req.body?.all) {
        const user = await requireUser(db, req);
        if (user) await db.session.deleteMany({ where: { userId: user.id } });
      } else if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return reply.code(204).send();
    },
  );
}
