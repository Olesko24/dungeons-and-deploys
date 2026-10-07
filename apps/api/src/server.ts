import { PrismaPg } from "@prisma/adapter-pg";
import { buildApp } from "./app.ts";
import { PrismaClient } from "./generated/prisma/client.ts";
import { smtpMailer } from "./mail.ts";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env("DATABASE_URL") }) });
const app = await buildApp(
  { db, sendMail: smtpMailer(env("SMTP_URL"), env("MAIL_FROM")), publicUrl: env("PUBLIC_URL") },
  {
    // Runs behind the Coolify proxy, client IPs for rate limiting come from X-Forwarded-For.
    trustProxy: true,
    logger: {
      // Strip query strings so magic link tokens never end up in logs.
      serializers: { req: (req) => ({ method: req.method, url: req.url.split("?")[0] }) },
    },
  },
);

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
