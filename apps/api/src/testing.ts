import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

const url = process.env.TEST_DATABASE_URL ?? "postgresql://tokenquest:tokenquest@localhost:5433/tokenquest";

/** Applies migrations to the `test` schema and returns an empty database. */
export async function testDb() {
  execFileSync("prisma", ["migrate", "deploy"], { env: { ...process.env, DATABASE_URL: `${url}?schema=test` }, stdio: "ignore" });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }, { schema: "test" }) });
  await db.session.deleteMany();
  await db.login.deleteMany();
  await db.user.deleteMany();
  await db.accessCode.deleteMany();
  return db;
}
