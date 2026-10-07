import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { IDEA_STATUSES } from "../ideas.ts";

const { values } = parseArgs({ options: { id: { type: "string" }, status: { type: "string" }, delete: { type: "boolean", default: false } } });
const id = Number(values.id);
const status = values.status as (typeof IDEA_STATUSES)[number] | undefined;
if (!Number.isInteger(id) || (!values.delete && !IDEA_STATUSES.includes(status!))) {
  console.error(`Usage: idea --id <n> (--status <${IDEA_STATUSES.join("|")}> | --delete)`);
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const idea = await db.idea.findUnique({ where: { id } });
if (!idea) {
  console.error(`No idea #${id}`);
  process.exit(1);
}
if (values.delete) await db.idea.delete({ where: { id } });
else await db.idea.update({ where: { id }, data: { status } });
await db.$disconnect();
console.log(`#${id} ${idea.title}: ${values.delete ? "deleted" : status}`);
