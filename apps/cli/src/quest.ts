#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { bar, minutesUntil, type Status, shortStatus } from "./status.ts";

const DEFAULT_SERVER = "http://localhost:3000";
const HEARTBEAT_INTERVAL_MS = 60_000;

const dir = join(homedir(), ".tokenquest");
const configFile = join(dir, "config.json");
const statusFile = join(dir, "status.txt");
const heartbeatFile = join(dir, "heartbeat");

type Config = { server: string; token: string };

async function api(server: string, path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(`${server}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function readConfig(): Promise<Config | null> {
  const raw = await readFile(configFile, "utf8").catch(() => null);
  return raw ? JSON.parse(raw) : null;
}

async function authed(path: string, method = "GET") {
  const config = await readConfig();
  if (!config) throw new Error("Not logged in. Run: quest login --code <ACCESS_CODE>");
  const res = await api(config.server, path, { method, token: config.token });
  if (res.status === 401) throw new Error("Session expired. Run: quest login");
  return res;
}

async function saveStatus(status: Status) {
  await writeFile(statusFile, shortStatus(status));
}

async function refresh() {
  const { data } = await authed("/quests/current");
  await saveStatus(data);
  return data as Status & { quest: { success: boolean | null; xp: number; gold: number } | null };
}

async function login(code: string | undefined) {
  const server = process.env.TOKENQUEST_URL ?? DEFAULT_SERVER;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question("Email: ")).trim();
  rl.close();

  const reg = await api(server, "/auth/register", { method: "POST", body: { email, code } });
  if (reg.status !== 200) throw new Error(reg.data.error ?? `Register failed (${reg.status})`);
  console.log(`Check your email. Confirm code: ${reg.data.confirmCode}`);
  process.stdout.write("Waiting...");

  while (true) {
    await sleep(2000);
    const poll = await api(server, "/auth/poll", { method: "POST", body: { loginId: reg.data.loginId } });
    if (poll.status === 202) continue;
    if (poll.status !== 200) throw new Error(`\n${poll.data.error ?? `Login failed (${poll.status})`}`);

    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(configFile, JSON.stringify({ server, token: poll.data.token }, null, 2), { mode: 0o600 });
    const me = await api(server, "/me", { token: poll.data.token });
    console.log(` ✓ Logged in as ${me.data.email}`);
    await refresh();
    return;
  }
}

/**
 * Called by hooks on every prompt. Returns at once: throttles via the mtime of a marker file and
 * sends the request from a detached child, so neither the shell nor Claude Code waits for the network.
 */
async function heartbeat(send: boolean) {
  if (send) {
    const { status, data } = await authed("/heartbeat", "POST");
    if (status === 200) await saveStatus(data);
    return;
  }
  if (!(await readConfig())) return;
  const last = await stat(heartbeatFile).then((s) => s.mtimeMs, () => 0);
  if (Date.now() - last < HEARTBEAT_INTERVAL_MS) return;
  await writeFile(heartbeatFile, "");
  spawn(process.execPath, [process.argv[1], "heartbeat", "--send"], { detached: true, stdio: "ignore" }).unref();
}

async function startQuest() {
  const res = await authed("/quests", "POST");
  if (res.status === 201) {
    console.log(`⚔ Quest started. Back in ${minutesUntil(res.data.endsAt)}m. Keep working, presence counts.`);
    await refresh();
  } else if (res.data.error === "cooldown") {
    console.log(`Resting. Next quest in ${minutesUntil(res.data.readyAt)}m.`);
  } else if (res.data.error === "quest already running") {
    await status();
  } else {
    throw new Error(res.data.error ?? `Quest failed to start (${res.status})`);
  }
}

async function status() {
  const data = await refresh();
  const q = data.quest;
  if (!q) return console.log("No quest yet. Start one: quest");
  const slots = bar(q.presentSlots, q.totalSlots);
  if (!q.resolved) {
    const left = minutesUntil(q.endsAt);
    return console.log(left > 0 ? `⚔ Quest ${left}m left · ${slots}` : `⚔ Quest finished, rolling the dice... · ${slots}`);
  }
  const result = q.success ? `✓ Success · +${q.xp} XP · +${q.gold} gold` : `✗ Failed · +${q.xp} XP`;
  const ready = minutesUntil(data.readyAt);
  console.log(`Last quest: ${result} · ${slots}`);
  console.log(ready > 0 ? `Next quest in ${ready}m.` : "Ready for a new quest: quest");
}

async function character() {
  const { data: c } = await authed("/character");
  console.log(`${c.name} · Lv ${c.level} · ${c.gold}g`);
  console.log(`XP ${bar(Math.floor((c.xpIntoLevel / c.xpForNext) * 10), 10)} ${c.xpIntoLevel}/${c.xpForNext}`);
}

const SHELL_HOOK = `_tokenquest_last=-60
_tokenquest_precmd() {
  (( SECONDS - _tokenquest_last < 60 )) && return
  _tokenquest_last=$SECONDS
  quest heartbeat
}
tokenquest_prompt() { [[ -r ~/.tokenquest/status.txt ]] && printf '%s' "$(<~/.tokenquest/status.txt)"; }`;

const INIT: Record<string, string> = {
  zsh: `${SHELL_HOOK}\nautoload -Uz add-zsh-hook\nadd-zsh-hook precmd _tokenquest_precmd`,
  bash: `${SHELL_HOOK}\nPROMPT_COMMAND="_tokenquest_precmd\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"`,
};

const USAGE = `Usage: quest [command]

  quest                     start a quest
  quest status [--short]    current quest (--short: one cached line, no network)
  quest char                character sheet
  quest login [--code <C>]  log in, new players need an access code
  quest init zsh|bash       shell integration, add to your rc file: eval "$(quest init zsh)"
  quest heartbeat           report presence (called by hooks)`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { code: { type: "string" }, short: { type: "boolean" }, send: { type: "boolean" } },
});

try {
  switch (positionals[0]) {
    case undefined:
      await startQuest();
      break;
    case "status":
      if (values.short) process.stdout.write(await readFile(statusFile, "utf8").catch(() => ""));
      else await status();
      break;
    case "char":
      await character();
      break;
    case "login":
      await login(values.code);
      break;
    case "heartbeat":
      await heartbeat(!!values.send).catch(() => {});
      break;
    case "init":
      if (!INIT[positionals[1]]) throw new Error("Usage: quest init zsh|bash");
      console.log(INIT[positionals[1]]);
      break;
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
