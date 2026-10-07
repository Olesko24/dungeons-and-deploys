import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const { values } = parseArgs({ options: { name: { type: "string" }, unban: { type: "boolean", default: false } } });
if (!values.name) {
  console.error("Usage: ban --name <character> [--unban]");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const character = await db.character.findUnique({ where: { name: values.name } });
if (!character) {
  console.error(`No character named ${values.name}`);
  process.exit(1);
}
await db.user.update({ where: { id: character.userId }, data: { bannedAt: values.unban ? null : new Date() } });
await db.$disconnect();
console.log(`${values.name} ${values.unban ? "unbanned" : "banned"}`);
