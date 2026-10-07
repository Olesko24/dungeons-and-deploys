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
  progress,
  rarityColor,
  type Status,
  shortStatus,
  statsText,
} from "./status.ts";

const DEFAULT_SERVER = "https://tokenquest.meiners-dev.de";
const MANUAL = "https://github.com/Olesko24/tokenquest/blob/main/docs/manual.md";
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
    quest: QuestResult | null;
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
  console.log(`Tokenquest is in beta: rules can change and progress may be reset.\nManual: ${MANUAL}`);
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

type QuestResult = { name: string; story: string | null; success: boolean | null; xp: number; gold: number; loot: { name: string; rarity: string } | null };

function questResult(q: QuestResult) {
  const loot = q.loot ? ` · Found: ${rarityColor(q.loot.name, q.loot.rarity)} (${q.loot.rarity})` : "";
  return `${q.name}: ${q.success ? `✓ Success · +${q.xp} XP · +${q.gold} gold${loot}` : `✗ Failed · +${q.xp} XP`}`;
}

async function startQuest() {
  const res = await authed("/quests", "POST");
  if (res.status === 201) {
    console.log(`⚔ ${questResult(res.data)}`);
    console.log(`  ${res.data.story}`);
    console.log(`Next quest in ${minutesUntil(res.data.readyAt)}m.`);
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
  if (!q.resolved) {
    const left = minutesUntil(q.endsAt);
    return console.log(left > 0 ? `⚔ Quest ${left}m left · ${progress(q)}` : "⚔ Quest finished, rolling the dice...");
  }
  const ready = minutesUntil(data.readyAt);
  console.log(`Last quest: ${questResult(q)}`);
  if (q.story) console.log(`  ${q.story}`);
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
  console.log(`  ${f.story}`);
  await refresh();
}

async function market(action: string | undefined, arg: string | undefined) {
  if (action === "list" || action === "unlist") {
    if (!arg) throw new Error(`Usage: quest market ${action} <#id>`);
    const res = await authed(`/market/${action}/${arg.replace("#", "")}`, "POST");
    if (res.status >= 400) throw new Error(res.data.error ?? `Failed (${res.status})`);
    return console.log(action === "list" ? "Listed. You get the price minus 10% when someone draws it." : "Taken off the market.");
  }
  if (action === "draw" && !["common", "rare", "epic", "legendary"].includes(arg ?? "")) {
    throw new Error("Usage: quest market draw <common|rare|epic|legendary>");
  }
  if (action === "draw") {
    const res = await authed("/market/draw", "POST", { rarity: arg });
    if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Draw failed (${res.status})`);
    const i = res.data.item;
    return console.log(`You paid ${res.data.price}g and drew: ${rarityColor(i.name, i.rarity)} (${i.rarity}) · ${statsText(i.stats)}`);
  }
  const { data } = await authed("/market");
  console.log(`Market · ${data.gold}g · ${data.drawsLeft ? "1 draw left today" : "daily draw used"}`);
  for (const o of data.offers) {
    const lock = o.unlocked ? "" : ` · unlocks at Lv ${o.unlockLevel}`;
    console.log(`  ${rarityColor(o.rarity.padEnd(10), o.rarity)} ${String(o.price).padStart(4)}g  ${String(o.available).padStart(3)} listed${lock}`);
  }
  console.log("\nquest market draw <rarity> · quest market list <#id> · quest market unlist <#id>");
}

async function dungeon(action: string | undefined, code: string | undefined) {
  if (action === "join" && !code) throw new Error("Usage: quest dungeon join <code>");
  if (action === "start" || action === "join") {
    const res = action === "start" ? await authed("/dungeons", "POST") : await authed("/dungeons/join", "POST", { code });
    if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Failed (${res.status})`);
    const d = res.data;
    console.log(`Dungeon ${d.code} · starts in ${minutesUntil(d.startsAt)}m · party: ${d.members.join(", ")}`);
    if (action === "start") console.log(`Others join with: quest dungeon join ${d.code}`);
    return refresh();
  }
  const { data } = await authed("/dungeons/current");
  const d = data.dungeon;
  if (!d) return console.log("No dungeon yet. Start one: quest dungeon start");
  console.log(`Dungeon ${d.code} · ${d.state} · party: ${d.members.join(", ")}`);
  console.log(`  ${d.story}`);
  d.stages.forEach((name: string, i: number) => {
    const mark = i < d.cleared ? "✓" : d.state === "failed" && i === d.cleared ? "✗" : i === d.cleared && d.current ? "⚔" : "·";
    console.log(`  ${mark} ${name}`);
  });
  if (d.state === "lobby") console.log(`Starts in ${minutesUntil(d.startsAt)}m. Others join with: quest dungeon join ${d.code}`);
  if (d.state === "running") console.log(`Stage ends in ${minutesUntil(d.stageEndsAt)}m.`);
  if (d.you.xp) console.log(`Your loot so far: +${d.you.xp} XP · +${d.you.gold} gold`);
}

async function guild(action: string | undefined, arg: string) {
  const call =
    action === "create" ? authed("/guild", "POST", { name: arg })
    : action === "join" ? authed("/guild/join", "POST", { code: arg })
    : action === "leave" ? authed("/guild/leave", "POST")
    : authed("/guild");
  const res = await call;
  if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Failed (${res.status})`);
  if (action === "leave") return console.log("You left the guild.");
  const g = res.data.guild;
  if (!g) return console.log("No guild yet. quest guild create <name> or quest guild join <code>");
  console.log(`${g.name} · guild Lv ${g.level} · ${g.members.length} members · join code ${g.code}`);
  for (const m of g.members) console.log(`  ${m.role === "leader" ? "♛" : " "} ${m.name.padEnd(20)} Lv ${m.level}`);
}

async function raid(action: string | undefined, minutes: string | undefined) {
  if (action === "schedule" && !/^\d+$/.test(minutes ?? "")) throw new Error("Usage: quest raid schedule <minutes from now, 5-1440>");
  const res =
    action === "schedule" ? await authed("/raids", "POST", { startsInMinutes: Number(minutes) })
    : action === "join" ? await authed("/raids/join", "POST")
    : await authed("/raids/current");
  if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Failed (${res.status})`);
  const r = res.data.raid;
  if (!r) return console.log("No raid yet. Guild leaders plan one: quest raid schedule <minutes>");
  const when = r.state === "scheduled" ? `starts in ${minutesUntil(r.startsAt)}m, needs ${r.minPlayers}` : r.state;
  console.log(`Raid on ${r.boss} · ${when} · ${r.members.length} raiders`);
  console.log(`  ${r.story}`);
  if (r.bossMaxHp) console.log(`HP ${bar(Math.ceil((r.bossHp / r.bossMaxHp) * 20), 20)} ${r.bossHp}/${r.bossMaxHp} · tick ${r.tick}/${r.ticks}`);
  for (const m of r.members) console.log(`  ${m.name.padEnd(20)} ${m.damage} damage`);
  if (r.state === "scheduled") console.log("Join with: quest raid join. Every raider deals damage each tick.");
}

async function shop(action: string | undefined, offer: string | undefined) {
  if (action === "buy") {
    if (!["1", "2", "3"].includes(offer ?? "")) throw new Error("Usage: quest shop buy <1-3>");
    const res = await authed("/shop/buy", "POST", { offer: Number(offer) });
    if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Failed (${res.status})`);
    const i = res.data.item;
    return console.log(`Bought for ${res.data.price}g: ${rarityColor(i.name, i.rarity)} (${i.rarity}) · ${statsText(i.stats)}`);
  }
  const { data } = await authed("/shop");
  const hours = Math.ceil(minutesUntil(data.refreshesAt) / 60);
  console.log(`Shop · ${data.gold}g · new offers in ${hours}h`);
  for (const o of data.offers) {
    const note = o.bought ? " · bought" : o.locked ? ` · unlocks at Lv ${o.unlockLevel}` : "";
    console.log(`  ${o.offer}  ${rarityColor(o.name.padEnd(32), o.rarity)}${o.rarity.padEnd(10)}${String(o.price).padStart(4)}g${note}`);
  }
  console.log("\nquest shop buy <1-3> · stats are rolled when you buy");
}

async function stats() {
  const { data } = await authed("/stats");
  const s = data.stats;
  const rows: [string, string | number][] = [
    ["Quests won / failed", `${s.questsWon} / ${s.questsFailed}`],
    ["Longest win streak", s.longestStreak],
    ["Gold earned", s.goldEarned],
    ["Monsters slain / fights lost", `${s.monstersSlain} / ${s.fightsLost}`],
    ["Items found / legendary", `${s.itemsFound} / ${s.legendariesFound}`],
    ["Dungeons cleared", s.dungeonsCleared],
    ["Raids won", s.raidsWon],
    ["Market sold / bought, shop", `${s.marketSold} / ${s.marketBought}, ${s.shopBought}`],
  ];
  for (const [label, value] of rows) console.log(`  ${label.padEnd(30)}${value}`);
  const done = data.achievements.filter((a: { unlockedAt: string | null }) => a.unlockedAt).length;
  console.log(`\nAchievements ${done}/${data.achievements.length}`);
  for (const a of data.achievements) {
    const date = a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString() : "";
    console.log(`  ${a.unlockedAt ? "★" : "·"} ${a.name.padEnd(24)}${a.description.padEnd(42)}${date}`);
  }
}

async function top(board = "xp") {
  if (!["xp", "achievements", "guilds"].includes(board)) throw new Error("Usage: quest top [xp|achievements|guilds]");
  const { data } = await authed(`/leaderboard?board=${board}`);
  const unit = board === "achievements" ? "achievements" : "XP";
  const line = (r: { rank: number; name: string; value: number; level?: number }) =>
    `${String(r.rank).padStart(4)}. ${r.name.padEnd(24)}${r.level ? `Lv ${String(r.level).padEnd(4)}` : ""}${r.value} ${unit}`;
  console.log(`Leaderboard · ${board}`);
  for (const r of data.top) console.log(line(r));
  if (data.you && data.you.rank > data.top.length) console.log(`   …\n${line(data.you)}`);
  if (!data.you) console.log(board === "guilds" ? "\nYou are not in a guild." : "\nNo achievements yet.");
}

/** Manual and changelog come from the server, so they match the version that is running there. */
async function doc(name: "manual" | "changelog") {
  const server = (await readConfig())?.server ?? process.env.TOKENQUEST_URL ?? DEFAULT_SERVER;
  const res = await fetch(`${server}/${name}.md`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Could not load the ${name} (${res.status}). Online: ${MANUAL}`);
  console.log(await res.text());
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

  quest                                          do a quest, result at once, then 45 min rest
  quest status [--short]                         current quest (--short: cached line, no network)
  quest char                                     character sheet
  quest inv                                      inventory
  quest equip <#id> [--slot ring2]               equip an item
  quest unequip <#id>                            take an item off
  quest fight                                    fight a monster that showed up
  quest market                                   draw a random item of a rarity, list your own
  quest shop [buy <1-3>]                         three new offers every day
  quest stats                                    statistics and achievements
  quest top [xp|achievements|guilds]             leaderboards
  quest manual                                   player manual
  quest changelog                                what changed
  quest dungeon [start|join <code>]              dungeon with up to 5 players
  quest guild [create <name>|join <code>|leave]  your guild
  quest raid [schedule <min>|join]               guild raid, at least 5 raiders
  quest login --code <code>                      new player, needs an access code
  quest pair                                     log in another device or the website
  quest login --pair <code>                      log in with a code from quest pair
  quest init zsh|bash                            shell integration: eval "$(quest init zsh)"
  quest heartbeat                                send a heartbeat (called by hooks, spawns monsters)

Manual: ${MANUAL}
Beta: rules can change and progress may be reset.`;

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
    case "raid":
      await raid(positionals[1], positionals[2]);
      break;
    case "guild":
      await guild(positionals[1], positionals.slice(2).join(" "));
      break;
    case "dungeon":
      await dungeon(positionals[1], positionals[2]);
      break;
    case "shop":
      await shop(positionals[1], positionals[2]);
      break;
    case "manual":
    case "changelog":
      await doc(positionals[0]);
      break;
    case "top":
      await top(positionals[1]);
      break;
    case "stats":
      await stats();
      break;
    case "market":
      await market(positionals[1], positionals[2]);
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
