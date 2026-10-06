import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";
import { buildApp } from "./app.ts";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const app = buildApp(db, { logger: true });

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
