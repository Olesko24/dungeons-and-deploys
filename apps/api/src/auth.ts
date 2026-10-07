import { createHash, randomBytes, randomInt } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient } from "./generated/prisma/client.ts";
import type { SendMail } from "./mail.ts";

const LOGIN_TTL_MS = 15 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");

export function randomCode(length: number) {
  return Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

async function isUsableCode(db: PrismaClient, code: string) {
  const row = await db.accessCode.findUnique({ where: { code } });
  return !!row && row.uses < row.maxUses && row.expiresAt > new Date();
}

export async function requireUser(db: PrismaClient, req: FastifyRequest) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  return session?.user ?? null;
}

export function authRoutes(app: FastifyInstance, db: PrismaClient, sendMail: SendMail, publicUrl: string) {
  app.post<{ Body: { email: string; code?: string } }>(
    "/auth/register",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: { email: { type: "string", format: "email", maxLength: 254 }, code: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const code = req.body.code?.trim().toUpperCase();
      const user = await db.user.findUnique({ where: { email } });
      if (!user && !(code && (await isUsableCode(db, code)))) {
        return reply.code(400).send({ error: "invalid or used-up access code" });
      }

      const loginId = secret();
      const linkToken = secret();
      const confirmCode = `${randomCode(2)}-${randomCode(2)}`;
      const expiresAt = new Date(Date.now() + LOGIN_TTL_MS);
      await db.login.create({
        data: {
          idHash: hash(loginId),
          linkHash: hash(linkToken),
          email,
          accessCode: user ? null : code,
          confirmCode,
          expiresAt,
        },
      });

      const link = `${publicUrl}/auth/verify?token=${linkToken}`;
      await sendMail({
        to: email,
        subject: `Tokenquest login ${confirmCode}`,
        text: `Confirm code: ${confirmCode}\n\nOpen this link to log in:\n${link}\n\nIf you did not request this, ignore this email.`,
      });

      return { loginId, confirmCode, expiresAt };
    },
  );

  app.get<{ Querystring: { token?: string } }>(
    "/auth/verify",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const login = await db.login.findUnique({ where: { linkHash: hash(req.query.token ?? "") } });
      reply.type("text/html");
      if (!login || login.expiresAt < new Date()) return page("Link expired", "Run <code>quest login</code> again.");
      if (login.userId) return page("Confirmed", "Go back to your terminal.");
      return page(
        "Confirm login",
        `<p>Only confirm if your terminal shows this code:</p>
        <p class="code">${login.confirmCode}</p>
        <form method="post" action="/auth/verify">
          <input type="hidden" name="token" value="${encodeURIComponent(req.query.token ?? "")}">
          <button>Confirm</button>
        </form>`,
      );
    },
  );

  // Confirming needs a POST: mail scanners open links with GET and must not log anyone in.
  app.post<{ Body: { token?: string } }>(
    "/auth/verify",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      reply.type("text/html");
      const login = await db.login.findUnique({ where: { linkHash: hash(req.body.token ?? "") } });
      if (!login || login.expiresAt < new Date()) return page("Link expired", "Run <code>quest login</code> again.");
      if (login.userId) return page("Confirmed", "Go back to your terminal.");

      const userId = await db.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email: login.email } });
        if (existing) return existing.id;
        const consumed = await tx.accessCode.updateMany({
          where: { code: login.accessCode ?? "", uses: { lt: tx.accessCode.fields.maxUses }, expiresAt: { gt: new Date() } },
          data: { uses: { increment: 1 } },
        });
        if (consumed.count === 0) return null;
        const user = await tx.user.create({ data: { email: login.email } });
        return user.id;
      });
      if (!userId) return reply.code(400).send(page("Access code used up", "Ask for a new access code."));

      await db.login.update({ where: { idHash: login.idHash }, data: { userId } });
      return page("Confirmed", "Go back to your terminal.");
    },
  );

  // POST instead of GET so the login id never shows up in URLs or access logs.
  app.post<{ Body: { loginId: string } }>(
    "/auth/poll",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: { body: { type: "object", required: ["loginId"], properties: { loginId: { type: "string" } } } },
    },
    async (req, reply) => {
      const idHash = hash(req.body.loginId);
      const login = await db.login.findUnique({ where: { idHash } });
      if (!login) return reply.code(404).send({ error: "unknown login" });
      if (login.expiresAt < new Date()) return reply.code(410).send({ error: "login expired" });
      if (!login.userId) return reply.code(202).send({ status: "pending" });

      // Deleting first makes the token one-time: a second poll finds nothing.
      const deleted = await db.login.deleteMany({ where: { idHash } });
      if (deleted.count === 0) return reply.code(404).send({ error: "unknown login" });
      const token = `tq_${secret()}`;
      await db.session.create({ data: { tokenHash: hash(token), userId: login.userId } });
      return { token };
    },
  );

  app.get("/me", async (req, reply) => {
    const user = await requireUser(db, req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    return { email: user.email };
  });
}

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tokenquest – ${title}</title>
<style>
  :root { --pixel: 4px; --ground: #0e0b16; --panel: #1c1630; --edge-dark: #06050b; --edge-light: #e4d2a6;
    --ink: #eee7d8; --gold: #f0c05a; --gold-dim: #a8843c; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--ground);
    color: var(--ink); font: 20px/1.4 monospace; }
  main { background: var(--panel); border: var(--pixel) solid var(--edge-light);
    box-shadow: 0 0 0 var(--pixel) var(--edge-dark); padding: calc(var(--pixel) * 6); max-width: 28rem; margin: 16px; }
  h1 { font-size: 24px; color: var(--gold); margin-top: 0; }
  .code { font-size: 32px; letter-spacing: 0.2em; color: var(--gold); }
  button { font: inherit; background: var(--gold); color: var(--edge-dark); border: 0; padding: 8px 24px; cursor: pointer;
    box-shadow: 0 var(--pixel) 0 var(--gold-dim), 0 calc(var(--pixel) * 2) 0 var(--edge-dark); }
  button:active { transform: translateY(var(--pixel)); box-shadow: 0 var(--pixel) 0 var(--edge-dark); }
  button:focus-visible { outline: var(--pixel) solid var(--gold); outline-offset: var(--pixel); }
</style>
</head>
<body><main><h1>${title}</h1>${body}</main></body>
</html>`;
}
