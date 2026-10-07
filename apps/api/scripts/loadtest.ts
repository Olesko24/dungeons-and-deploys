// Seeds load-test players and fires heartbeats at the API.
// Usage: node --env-file=.env scripts/loadtest.ts [--players 10000] [--rate 165] [--seconds 60] [--url http://localhost:3000] [--cleanup]
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import autocannon from "autocannon";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const { values } = parseArgs({
  options: {
    players: { type: "string", default: "10000" },
    rate: { type: "string", default: "165" },
    seconds: { type: "string", default: "60" },
    url: { type: "string", default: "http://localhost:3000" },
    cleanup: { type: "boolean", default: false },
  },
});
const players = Number(values.players);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

if (values.cleanup) {
  const { count } = await db.user.deleteMany({ where: { character: { name: { startsWith: "load_" } } } });
  console.log(`Removed ${count} load-test players`);
  process.exit(0);
}

if (!(await db.character.findUnique({ where: { name: "load_1" } }))) {
  console.log(`Seeding ${players} players, every second one on a quest...`);
  await db.$executeRawUnsafe(`
    DO $$ DECLARE uid int; cid int; BEGIN
      FOR i IN 1..${players} LOOP
        INSERT INTO users DEFAULT VALUES RETURNING id INTO uid;
        INSERT INTO characters (user_id, name) VALUES (uid, 'load_' || i) RETURNING id INTO cid;
        INSERT INTO sessions (token_hash, user_id) VALUES (encode(sha256(convert_to('tq_load_' || i, 'UTF8')), 'hex'), uid);
        IF i % 2 = 0 THEN
          INSERT INTO quests (character_id, started_at, ends_at) VALUES (cid, now(), now() + interval '45 minutes');
        END IF;
      END LOOP;
    END $$;`);
}
await db.$disconnect();

// Round robin over all players: at 165/s each token comes back after about 60 s, inside its 1/min limit.
let next = 0;
const result = await autocannon({
  url: `${values.url}/heartbeat`,
  method: "POST",
  connections: 50,
  overallRate: Number(values.rate),
  duration: Number(values.seconds),
  requests: [{ setupRequest: (req) => ({ ...req, headers: { authorization: `Bearer tq_load_${(next++ % players) + 1}` } }) }],
});

const codes = Object.entries(result.statusCodeStats ?? {}).map(([code, s]) => `${code}: ${s.count}`).join(", ");
console.log(`Requests: ${result.requests.total} (${result.requests.average}/s) · status ${codes}`);
console.log(`Latency ms: p50 ${result.latency.p50} · p97.5 ${result.latency.p97_5} · p99 ${result.latency.p99} · max ${result.latency.max}`);
console.log(`Errors: ${result.errors} · timeouts: ${result.timeouts}`);
