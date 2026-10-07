#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  bar,
  type InventoryItem,
  inventoryLines,
  minutesUntil,
  rarityColor,
  type Status,
  shortStatus,
  statsText,
} from "./status.ts";

const DEFAULT_SERVER = "https://tokenquest.meiners-dev.de";
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

async function authed(path: string, method = "GET", body?: unknown) {
  const config = await readConfig();
  if (!config) throw new Error("Not logged in. Run: quest login");
  const res = await api(config.server, path, { method, token: config.token, body });
  if (res.status === 401) throw new Error("Session invalid. Run: quest login");
  return res;
}

async function saveStatus(status: Status) {
  await writeFile(statusFile, shortStatus(status));
}

async function refresh() {
  const { data } = await authed("/quests/current");
  await saveStatus(data);
  return data as Status & {
    quest: { success: boolean | null; xp: number; gold: number; loot: { name: string; rarity: string } | null } | null;
  };
}

async function login(code: string | undefined, pair: string | undefined) {
  const server = process.env.TOKENQUEST_URL ?? DEFAULT_SERVER;
  let res: Awaited<ReturnType<typeof api>>;
  if (pair) {
    res = await api(server, "/auth/pair/redeem", { method: "POST", body: { code: pair } });
  } else if (code) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const name = (await rl.question("Character name (2-20 letters, digits, _ or -): ")).trim();
    rl.close();
    res = await api(server, "/auth/register", { method: "POST", body: { code, name } });
  } else {
    throw new Error("New player: quest login --code <ACCESS_CODE>\nOther device: quest pair, then quest login --pair <CODE>");
  }
  if (res.status !== 200) throw new Error(res.data.error ?? res.data.message ?? `Login failed (${res.status})`);

  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(configFile, JSON.stringify({ server, token: res.data.token }, null, 2), { mode: 0o600 });
  const status = await refresh();
  console.log(`✓ Logged in as ${status.character.name}`);
}

async function pair() {
  const { data } = await authed("/auth/pair", "POST");
  console.log(`On your other device, within ${minutesUntil(data.expiresAt)} minutes:\n\n  quest login --pair ${data.code}`);
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
  const e = data.encounter;
  if (e) console.log(`⚠ ${e.name} appeared! quest fight within ${minutesUntil(e.expiresAt)}m · odds ${Math.round(e.winChance * 100)}%`);
  if (!q) return console.log("No quest yet. Start one: quest");
  const slots = bar(q.presentSlots, q.totalSlots);
  if (!q.resolved) {
    const left = minutesUntil(q.endsAt);
    return console.log(left > 0 ? `⚔ Quest ${left}m left · ${slots}` : `⚔ Quest finished, rolling the dice... · ${slots}`);
  }
  const loot = q.loot ? ` · Found: ${rarityColor(q.loot.name, q.loot.rarity)} (${q.loot.rarity})` : "";
  const result = q.success ? `✓ Success · +${q.xp} XP · +${q.gold} gold${loot}` : `✗ Failed · +${q.xp} XP`;
  const ready = minutesUntil(data.readyAt);
  console.log(`Last quest: ${result} · ${slots}`);
  console.log(ready > 0 ? `Next quest in ${ready}m.` : "Ready for a new quest: quest");
}

async function fightMonster() {
  const res = await authed("/fight", "POST");
  if (res.status === 404) return console.log("No monster around. They show up while you work.");
  if (res.status >= 400) throw new Error(res.data.error ?? `Fight failed (${res.status})`);
  const f = res.data;
  console.log(`⚔ ${f.monster} (Lv ${f.level}) · your odds ${Math.round(f.winChance * 100)}%`);
  if (!f.won) console.log("✗ Defeated. It got away, nothing lost.");
  else {
    const loot = f.loot ? ` · Found: ${rarityColor(f.loot.name, f.loot.rarity)} (${f.loot.rarity})` : "";
    console.log(`✓ Victory · +${f.xp} XP · +${f.gold} gold${loot}`);
  }
  await refresh();
}

async function character() {
  const { data: c } = await authed("/character");
  console.log(`${c.name} · Lv ${c.level} · ${c.gold}g`);
  console.log(`XP ${bar(Math.floor((c.xpIntoLevel / c.xpForNext) * 10), 10)} ${c.xpIntoLevel}/${c.xpForNext}`);
  console.log(statsText(c) || "No equipment yet. See: quest inv");
}

async function inventory() {
  const { data } = await authed("/inventory");
  console.log(inventoryLines(data.items as InventoryItem[], data.bonus).join("\n"));
}

async function equip(id: string | undefined, slot: string | undefined, off = false) {
  if (!id) throw new Error(`Usage: quest ${off ? "unequip" : "equip"} <#id>${off ? "" : " [--slot ring1|ring2]"}`);
  const path = `/inventory/${id.replace("#", "")}/${off ? "unequip" : "equip"}`;
  const res = await authed(path, "POST", off ? undefined : { slot });
  if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Failed (${res.status})`);
  await inventory();
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
  quest fight               fight a monster that showed up
  quest inv                 inventory
  quest equip <#id>         equip an item (--slot ring1|ring2 for rings)
  quest unequip <#id>       take an item off
  quest login --code <C>    new player, needs an access code
  quest pair                log in another device
  quest login --pair <C>    log in with a code from quest pair
  quest init zsh|bash       shell integration, add to your rc file: eval "$(quest init zsh)"
  quest heartbeat           report presence (called by hooks)`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { code: { type: "string" }, pair: { type: "string" }, slot: { type: "string" }, short: { type: "boolean" }, send: { type: "boolean" } },
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
    case "fight":
      await fightMonster();
      break;
    case "inv":
      await inventory();
      break;
    case "equip":
      await equip(positionals[1], values.slot);
      break;
    case "unequip":
      await equip(positionals[1], undefined, true);
      break;
    case "login":
      await login(values.code, values.pair);
      break;
    case "pair":
      await pair();
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
