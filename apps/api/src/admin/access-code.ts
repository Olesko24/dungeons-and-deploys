import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash, randomCode } from "../auth.ts";
import { PrismaClient } from "../generated/prisma/client.ts";

const { values } = parseArgs({ options: { uses: { type: "string", default: "1" }, days: { type: "string", default: "30" } } });
const maxUses = Number(values.uses);
const days = Number(values.days);
if (!Number.isInteger(maxUses) || maxUses < 1 || !Number.isInteger(days) || days < 1) {
  console.error("Usage: access-code [--uses <n>] [--days <n>]");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const code = `${randomCode(4)}-${randomCode(4)}`;
const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
await db.accessCode.create({ data: { codeHash: hash(code), maxUses, expiresAt } });
await db.$disconnect();

console.log(`${code}  (${maxUses} uses, expires ${expiresAt.toISOString().slice(0, 10)})`);
