#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const server = process.env.TOKENQUEST_URL ?? "http://localhost:3000";
const configDir = join(homedir(), ".tokenquest");
const configFile = join(configDir, "config.json");

async function api(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(`${server}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function login(code: string | undefined) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question("Email: ")).trim();
  rl.close();

  const reg = await api("/auth/register", { method: "POST", body: { email, code } });
  if (reg.status !== 200) throw new Error(reg.data.error ?? `Register failed (${reg.status})`);
  console.log(`Check your email. Confirm code: ${reg.data.confirmCode}`);
  process.stdout.write("Waiting...");

  while (true) {
    await sleep(2000);
    const poll = await api("/auth/poll", { method: "POST", body: { loginId: reg.data.loginId } });
    if (poll.status === 202) continue;
    if (poll.status !== 200) throw new Error(`\n${poll.data.error ?? `Login failed (${poll.status})`}`);

    await mkdir(configDir, { recursive: true, mode: 0o700 });
    await writeFile(configFile, JSON.stringify({ server, token: poll.data.token }, null, 2), { mode: 0o600 });
    const me = await api("/me", { token: poll.data.token });
    console.log(` ✓ Logged in as ${me.data.email}`);
    return;
  }
}

async function token() {
  const config = await readFile(configFile, "utf8").catch(() => null);
  if (!config) throw new Error("Not logged in. Run: quest login --code <ACCESS_CODE>");
  return JSON.parse(config).token as string;
}

async function authed(path: string, method = "GET") {
  const res = await api(path, { method, token: await token() });
  if (res.status === 401) throw new Error("Session expired. Run: quest login");
  return res;
}

const minutes = (until: string) => Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000));
const bar = (filled: number, total: number) => "■".repeat(filled) + "□".repeat(Math.max(0, total - filled));

async function startQuest() {
  const res = await authed("/quests", "POST");
  if (res.status === 201) {
    console.log(`⚔ Quest started. Back in ${minutes(res.data.endsAt)}m. Keep working, presence counts.`);
  } else if (res.data.error === "cooldown") {
    console.log(`Resting. Next quest in ${minutes(res.data.readyAt)}m.`);
  } else if (res.data.error === "quest already running") {
    await status();
  } else {
    throw new Error(res.data.error ?? `Quest failed to start (${res.status})`);
  }
}

async function status() {
  const { data } = await authed("/quests/current");
  const q = data.quest;
  if (!q) return console.log("No quest yet. Start one: quest");
  const slots = bar(q.presentSlots, q.totalSlots);
  if (!q.resolved) {
    const left = minutes(q.endsAt);
    return console.log(left > 0 ? `⚔ Quest ${left}m left · ${slots}` : `⚔ Quest finished, rolling the dice... · ${slots}`);
  }
  const result = q.success ? `✓ Success · +${q.xp} XP · +${q.gold} gold` : `✗ Failed · +${q.xp} XP`;
  const ready = minutes(data.readyAt);
  console.log(`Last quest: ${result} · ${slots}`);
  console.log(ready > 0 ? `Next quest in ${ready}m.` : "Ready for a new quest: quest");
}

async function character() {
  const { data: c } = await authed("/character");
  console.log(`${c.name} · Lv ${c.level} · ${c.gold}g`);
  console.log(`XP ${bar(Math.floor((c.xpIntoLevel / c.xpForNext) * 10), 10)} ${c.xpIntoLevel}/${c.xpForNext}`);
}

const { positionals, values } = parseArgs({ allowPositionals: true, options: { code: { type: "string" } } });

try {
  switch (positionals[0]) {
    case undefined:
      await startQuest();
      break;
    case "status":
      await status();
      break;
    case "char":
      await character();
      break;
    case "login":
      await login(values.code);
      break;
    default:
      console.log("Usage: quest [status | char | login [--code <ACCESS_CODE>]]");
      process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
