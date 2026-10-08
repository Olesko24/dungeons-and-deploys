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

const DEFAULT_SERVER = "https://dnd.meiners-dev.de";
const MANUAL = "https://github.com/Olesko24/dungeons-and-deploys/blob/main/docs/manual.md";
const HEARTBEAT_INTERVAL_MS = 60_000;

const dir = join(homedir(), ".dungeons-and-deploys");
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
    encounter: { name: string; expiresAt: string; winChance: number; power: number; recommended: number } | null;
  };
}

async function login(code: string | undefined, pair: string | undefined) {
  const server = process.env.DND_URL ?? DEFAULT_SERVER;
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
  console.log(`Dungeons & Deploys is in beta: rules can change and progress may be reset.\nManual: ${MANUAL}`);
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

type Loot = { name: string; rarity: string; scrapped?: boolean; scrap?: number };
type QuestResult = { name: string; story: string | null; success: boolean | null; xp: number; gold: number; loot: Loot | null; rested?: boolean };

const lootText = (l: Loot) => `${rarityColor(l.name, l.rarity)} (${l.rarity})${l.scrapped ? `, bag full, scrapped for ${l.scrap}g` : ""}`;

function questResult(q: QuestResult) {
  const loot = q.loot ? ` · Found: ${lootText(q.loot)}` : "";
  const rested = q.rested ? " · rested +50%" : "";
  return `${q.name}: ${q.success ? `✓ Success · +${q.xp} XP · +${q.gold} gold${rested}${loot}` : `✗ Failed · +${q.xp} XP${rested}`}`;
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
  if (e) {
    console.log(`⚠ ${e.name} appeared! quest fight within ${minutesUntil(e.expiresAt)}m · odds ${Math.round(e.winChance * 100)}%`);
    console.log(`  your power ${e.power} · recommended ${e.recommended}`);
  }
  if (!q) return console.log("No quest yet. Start one: quest");
  if (!q.resolved) {
    const left = minutesUntil(q.endsAt);
    return console.log(left > 0 ? `⚔ Quest ${left}m left · ${progress(q)}` : "⚔ Quest finished, rolling the dice...");
  }
  const ready = minutesUntil(data.readyAt);
  console.log(`Last quest: ${questResult(q)}`);
  if (q.story) console.log(`  ${q.story}`);
  console.log(ready > 0 ? `Next quest in ${ready}m.` : "Ready for a new quest: quest");
  if (data.rested) console.log(`Rested: the next ${data.rested} quests give +50% XP and gold.`);
}

async function fightMonster() {
  const res = await authed("/fight", "POST");
  if (res.status === 404) return console.log("No monster around. They show up while you work.");
  if (res.status >= 400) throw new Error(res.data.error ?? `Fight failed (${res.status})`);
  const f = res.data;
  console.log(`⚔ ${f.monster} (Lv ${f.level}) · your odds ${Math.round(f.winChance * 100)}%`);
  if (!f.won) console.log("✗ Defeated. It got away, nothing lost.");
  else {
    const loot = f.loot ? ` · Found: ${lootText(f.loot)}` : "";
    console.log(`✓ Victory · +${f.xp} XP · +${f.gold} gold${loot}`);
  }
  console.log(`  ${f.story}`);
  await refresh();
}

const TAGS: Record<string, string> = { loot: "Loot", fair: "Fair trade", ripoff: "Rip-off" };
const SLOTS = ["helm", "chest", "legs", "gloves", "boots", "weapon", "twoHanded", "shield", "ring", "necklace", "earrings"];
const SHOW: Record<string, Record<string, string>> = { line: { phase: "draw" }, buy: { phase: "buy" }, mine: { mine: "true" } };

const fail = (res: { status: number; data: { error?: string; message?: string } }) => {
  if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Failed (${res.status})`);
};

type Listing = {
  item: InventoryItem;
  seller: string;
  price: number;
  value: number;
  tag: string;
  drawAt: string;
  phase: "draw" | "drawing" | "buy";
  bidders: number;
  joined: boolean;
  mine: boolean;
};

async function market([action, arg, price]: string[], filter: { rarity?: string; slot?: string; show?: string; sort?: string }) {
  const id = arg?.replace("#", "");
  if (action && action !== "list" && action !== "sell" && !id) throw new Error(`Usage: quest market ${action} <#id>`);
  if (action === "sell" || action === "list") {
    if (!id) throw new Error("Usage: quest market sell <#id> [price]");
    const res = await authed(`/market/list/${id}`, "POST", price ? { price: Number(price) } : {});
    fail(res);
    return console.log(`Listed for ${res.data.price}g. Buyers line up for 30 minutes, then one is drawn. You get the price minus 10%.`);
  }
  if (action === "unlist") {
    fail(await authed(`/market/unlist/${id}`, "POST"));
    return console.log("Taken off the market.");
  }
  if (action === "buy") {
    const res = await authed(`/market/buy/${id}`, "POST");
    fail(res);
    if (res.data.state === "bought") return console.log(`Bought ${rarityColor(res.data.item.name, res.data.item.rarity)}. It is in your bag.`);
    return console.log(`In line, ${res.data.bidders} so far. The draw is in ${minutesUntil(res.data.drawAt)}m, your gold is reserved until then.`);
  }
  if (action === "leave") {
    fail(await authed(`/market/leave/${id}`, "POST"));
    return console.log("Left the line, your gold is back.");
  }
  if (action) throw new Error("Usage: quest market [buy|leave|sell|unlist <#id>], see quest help");

  if (filter.show && !SHOW[filter.show]) throw new Error("--show takes line, buy or mine");
  if (filter.slot && !SLOTS.includes(filter.slot)) throw new Error(`--slot takes ${SLOTS.join(", ")}`);
  const query = new URLSearchParams({
    sort: filter.sort ?? "ending",
    ...(filter.rarity && { rarity: filter.rarity }),
    ...(filter.slot && { type: filter.slot }),
    ...(filter.show && SHOW[filter.show]),
  });
  const res = await authed(`/market?${query}`);
  fail(res);
  const listings = res.data.listings as Listing[];
  console.log(`Market · ${res.data.gold}g · ${listings.length} listing${listings.length === 1 ? "" : "s"}`);
  for (const l of listings) {
    const phase = l.phase === "draw" ? `draw in ${minutesUntil(l.drawAt)}m, ${l.bidders} in line` : l.phase === "drawing" ? "drawing" : "buy now";
    const who = l.mine ? " · yours" : l.joined ? " · you are in line" : "";
    console.log(
      `  ${`#${l.item.id}`.padEnd(7)}${rarityColor(l.item.name.padEnd(40), l.item.rarity)}${statsText(l.item.stats).padEnd(28)}` +
        `${String(l.price).padStart(6)}g ${TAGS[l.tag].padEnd(10)} ${phase}${who}`,
    );
  }
  console.log("\nquest market buy|leave <#id> · quest market sell <#id> [price] · quest market unlist <#id>");
  console.log("Filters: --rarity epic · --slot ring · --show line|buy|mine · --sort price");
}

async function inbox([action, arg]: string[]) {
  if (action === "delete") {
    if (!arg) throw new Error("Usage: quest inbox delete <#id>");
    fail(await authed(`/inbox/delete/${arg.replace("#", "")}`, "POST"));
    return console.log("Deleted.");
  }
  if (action === "clear") {
    fail(await authed("/inbox/clear", "POST"));
    return console.log("Inbox cleared.");
  }
  const { data } = await authed("/inbox");
  if (!data.notifications.length) return console.log("Inbox empty.");
  for (const n of data.notifications as { id: number; text: string; createdAt: string; unread: boolean }[]) {
    const at = new Date(n.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    console.log(`${n.unread ? "●" : " "} ${`#${n.id}`.padEnd(7)}${at.padEnd(18)}${n.text}`);
  }
  console.log("\nquest inbox delete <#id> · quest inbox clear");
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
    console.log(`  ${mark} ${name.padEnd(32)} power ${d.power[i]} / ${d.recommended[i]} recommended`);
  });
  if (d.state === "lobby") console.log(`Starts in ${minutesUntil(d.startsAt)}m. Others join with: quest dungeon join ${d.code}`);
  if (d.state === "running") console.log(`Stage ends in ${minutesUntil(d.stageEndsAt)}m.`);
  if (d.you.xp) console.log(`Your loot so far: +${d.you.xp} XP · +${d.you.gold} gold`);
}

type Buff = { key: string; name: string; text: string; cost: number; level: number; unlocked: boolean; endsAt: string | null };

async function guild(action: string | undefined, arg: string) {
  if (action === "donate" && !/^\d+$/.test(arg)) throw new Error("Usage: quest guild donate <gold>");
  const call =
    action === "create" ? authed("/guild", "POST", { name: arg })
    : action === "join" ? authed("/guild/join", "POST", { code: arg })
    : action === "leave" ? authed("/guild/leave", "POST")
    : action === "donate" ? authed("/guild/donate", "POST", { amount: Number(arg) })
    : action === "buff" && arg ? authed("/guild/buffs", "POST", { key: arg })
    : authed("/guild");
  const res = await call;
  if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Failed (${res.status})`);
  if (action === "leave") return console.log("You left the guild.");
  const g = res.data.guild;
  if (!g) return console.log("No guild yet. quest guild create <name> or quest guild join <code>");
  console.log(`${g.name} · guild Lv ${g.level} · ${g.members.length} members · bank ${g.gold}g · join code ${g.code}`);
  for (const m of g.members) console.log(`  ${m.role === "leader" ? "♛" : " "} ${m.name.padEnd(20)} Lv ${String(m.level).padEnd(4)} donated ${m.donated}g`);
  console.log("\nBuffs, 24h for every member:");
  for (const b of g.buffs as Buff[]) {
    const state = b.endsAt ? `active, ${Math.ceil(minutesUntil(b.endsAt) / 60)}h left` : b.unlocked ? `${b.cost}g` : `guild Lv ${b.level}`;
    console.log(`  ${b.key.padEnd(15)} ${b.text.padEnd(32)} ${state}`);
  }
  console.log("\nquest guild donate <gold> · leader: quest guild buff <key>");
}

type Boss = { tier: number; name: string; recommended: number; unlocked: boolean };

async function raid(action: string | undefined, minutes: string | undefined, boss: string | undefined) {
  if (action === "schedule" && (!/^\d+$/.test(minutes ?? "") || (boss && !/^\d+$/.test(boss)))) {
    throw new Error("Usage: quest raid schedule <minutes from now, 5-1440> [boss number]");
  }
  if (action === "schedule" || action === "join") {
    const body = action === "schedule" ? { startsInMinutes: Number(minutes), tier: boss ? Number(boss) - 1 : undefined } : undefined;
    const res = await authed(action === "schedule" ? "/raids" : "/raids/join", "POST", body);
    if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Failed (${res.status})`);
  }
  const { data } = await authed("/raids/current");
  if (!data.bosses.length) return console.log("Raids need a guild. See: quest guild");
  const r = data.raid;
  if (!r) console.log("No raid yet. Guild leaders plan one: quest raid schedule <minutes> [boss number]");
  else {
    const when = r.state === "scheduled" ? `starts in ${minutesUntil(r.startsAt)}m, needs ${r.minPlayers}` : r.state;
    console.log(`Raid on ${r.boss} · ${when} · ${r.members.length} raiders · power ${data.power} / ${r.recommended} recommended`);
    console.log(`  ${r.story}`);
    if (r.bossMaxHp) console.log(`HP ${bar(Math.ceil((r.bossHp / r.bossMaxHp) * 20), 20)} ${r.bossHp}/${r.bossMaxHp} · tick ${r.tick}/${r.ticks}`);
    for (const m of r.members) console.log(`  ${m.name.padEnd(20)} ${m.damage} damage`);
    if (r.state === "scheduled") console.log("Join with: quest raid join. Every raider deals damage each tick.");
  }
  console.log(`\nBosses · your raid power ${data.power}, the raid's average counts`);
  for (const b of data.bosses as Boss[]) {
    console.log(`  ${b.tier + 1} ${b.name.padEnd(24)} ${String(b.recommended).padStart(6)} recommended${b.unlocked ? "" : " · locked"}`);
  }
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
    console.log(`  ${o.offer}  ${rarityColor(o.name.padEnd(40), o.rarity)}${o.rarity.padEnd(10)}${String(o.price).padStart(5)}g  ${statsText(o.stats)}${note}`);
  }
  console.log("\nquest shop buy <1-3>");
}

type Talent = { key: string; tree: string; row: number; rank: number; max: number; current: string | null; next: string | null; error: string | null };

async function talents(action: string | undefined, key: string | undefined) {
  if (action === "learn" && !key) throw new Error("Usage: quest talents learn <key>");
  const res =
    action === "learn" ? await authed("/talents/learn", "POST", { key })
    : action === "reset" ? await authed("/talents/reset", "POST")
    : await authed("/talents");
  if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Failed (${res.status})`);
  const d = res.data;
  console.log(`Talents · ${d.points - d.spent} of ${d.points} points free · reset costs ${d.resetCost}g, you have ${d.gold}g`);
  for (const { tree, spent } of d.trees as { tree: string; spent: number }[]) {
    console.log(`\n${tree[0].toUpperCase()}${tree.slice(1)} · ${spent} points`);
    for (const t of d.talents.filter((t: Talent) => t.tree === tree)) {
      const lock = t.error?.startsWith("needs") ? ` · ${t.error}` : "";
      const effect = t.current ?? `next: ${t.next}`;
      console.log(`  R${t.row + 1} ${t.key.padEnd(20)}${`${t.rank}/${t.max}`.padStart(4)}  ${effect}${lock}`);
    }
  }
  console.log("\nquest talents learn <key> · quest talents reset");
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
  if (!["xp", "power", "achievements", "guilds"].includes(board)) throw new Error("Usage: quest top [xp|power|achievements|guilds]");
  const { data } = await authed(`/leaderboard?board=${board}`);
  const unit = board === "achievements" ? "achievements" : board === "power" ? "power" : "XP";
  const line = (r: { rank: number; name: string; value: number; level?: number; members?: number; power?: number }) =>
    `${String(r.rank).padStart(4)}. ${r.name.padEnd(24)}${r.level ? `Lv ${String(r.level).padEnd(4)}` : ""}${r.value} ${unit}` +
    (r.members === undefined ? "" : ` · ${r.members} members · Ø ${r.power} power`);
  console.log(`Leaderboard · ${board}`);
  for (const r of data.top) console.log(line(r));
  if (data.you && data.you.rank > data.top.length) console.log(`   …\n${line(data.you)}`);
  if (!data.you) console.log(board === "guilds" ? "\nYou are not in a guild." : "\nNo achievements yet.");
}

/** Manual and changelog come from the server, so they match the version that is running there. */
async function doc(name: "manual" | "changelog") {
  const server = (await readConfig())?.server ?? process.env.DND_URL ?? DEFAULT_SERVER;
  const res = await fetch(`${server}/${name}.md`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Could not load the ${name} (${res.status}). Online: ${MANUAL}`);
  console.log(await res.text());
}

async function character() {
  const { data: c } = await authed("/character");
  console.log(`${c.name} · Lv ${c.level} · Power ${c.power} · ${c.gold}g`);
  console.log(`XP ${bar(Math.floor((c.xpIntoLevel / c.xpForNext) * 10), 10)} ${c.xpIntoLevel}/${c.xpForNext}`);
  console.log(statsText(c) || "No equipment yet. See: quest inv");
  if (c.unread) console.log(`Inbox: ${c.unread} unread. See: quest inbox`);
}

async function inventory() {
  const { data } = await authed("/inventory");
  console.log(inventoryLines(data.items as InventoryItem[], data.bonus, rarityColor, data.limit).join("\n"));
  const shards = Object.entries(data.shards as Record<string, number>);
  if (shards.length) console.log(`\nShards · ${shards.map(([rarity, count]) => `${count}× ${rarityColor(rarity, rarity)}`).join(" · ")}`);
  console.log("\nquest equip <#id> · quest scrap <#id> · quest upgrade <#id> <#id> <#id> · quest forge <rarity> · quest market sell <#id> [price]");
}

async function upgrade(ids: string[]) {
  if (!ids.length) throw new Error("Usage: quest upgrade <#id> <#id> <#id>");
  const res = await authed("/inventory/upgrade", "POST", { ids: ids.map((id) => Number(id.replace("#", ""))) });
  fail(res);
  console.log(`Fused into ${lootText(res.data.item)}.`);
}

async function forge(rarity: string | undefined) {
  if (!rarity) throw new Error("Usage: quest forge <rarity>");
  const res = await authed(`/inventory/shards/${encodeURIComponent(rarity)}/forge`, "POST");
  fail(res);
  console.log(`Forged ${lootText(res.data.item)}.`);
}

async function scrap(id: string | undefined) {
  if (!id) throw new Error("Usage: quest scrap <#id>");
  const res = await authed(`/inventory/${id.replace("#", "")}/scrap`, "POST");
  fail(res);
  console.log(`Scrapped for ${res.data.gold}g.`);
}

async function equip(id: string | undefined, slot: string | undefined, off = false) {
  if (!id) throw new Error(`Usage: quest ${off ? "unequip" : "equip"} <#id>${off ? "" : " [--slot ring1|ring2]"}`);
  const path = `/inventory/${id.replace("#", "")}/${off ? "unequip" : "equip"}`;
  const res = await authed(path, "POST", off ? undefined : { slot });
  if (res.status >= 400) throw new Error(res.data.error ?? res.data.message ?? `Failed (${res.status})`);
  await inventory();
}

const SHELL_HOOK = `_dnd_last=-60
_dnd_precmd() {
  (( SECONDS - _dnd_last < 60 )) && return
  _dnd_last=$SECONDS
  quest heartbeat
}
dnd_prompt() { [[ -r ~/.dungeons-and-deploys/status.txt ]] && printf '%s' "$(<~/.dungeons-and-deploys/status.txt)"; }`;

const INIT: Record<string, string> = {
  zsh: `${SHELL_HOOK}\nautoload -Uz add-zsh-hook\nadd-zsh-hook precmd _dnd_precmd`,
  bash: `${SHELL_HOOK}\nPROMPT_COMMAND="_dnd_precmd\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"`,
};

const USAGE = `Usage: quest [command]

  quest                                          do a quest, result at once, then 45 min rest
  quest status [--short]                         current quest (--short: cached line, no network)
  quest char                                     character sheet
  quest inv                                      inventory
  quest equip <#id> [--slot ring2]               equip an item
  quest unequip <#id>                            take an item off
  quest scrap <#id>                              destroy a bag item for a quarter of its value
  quest upgrade <#id> <#id> <#id>                fuse 3 items of one rarity into a random one of the next
  quest forge <rarity>                           turn a shard into a random item of its rarity
  quest fight                                    fight a monster that showed up
  quest market [--rarity r] [--slot s]           every listing, --show line|buy|mine, --sort price
  quest market buy|leave <#id>                   join a line or buy at once, leave a line
  quest market sell <#id> [price] | unlist <#id> sell from your bag, 10% fee
  quest inbox [delete <#id>|clear]               what happened while you were away
  quest shop [buy <1-3>]                         three new offers every day
  quest stats                                    statistics and achievements
  quest talents [learn <key>|reset]              one talent point per level, reset costs 10g per point
  quest top [xp|power|achievements|guilds]       leaderboards
  quest manual                                   player manual
  quest changelog                                what changed
  quest dungeon [start|join <code>]              dungeon with up to 5 players
  quest guild [create <name>|join <code>|leave]  your guild
  quest guild donate <gold> | buff <key>         guild bank and buffs
  quest raid [schedule <min> [boss]|join]        guild raid, at least 5 raiders
  quest login --code <code>                      new player, needs an access code
  quest pair                                     log in another device or the website
  quest login --pair <code>                      log in with a code from quest pair
  quest init zsh|bash                            shell integration: eval "$(quest init zsh)"
  quest heartbeat                                send a heartbeat (called by hooks, spawns monsters)
  quest help, --help, -h                         this overview

Manual: ${MANUAL}
Beta: rules can change and progress may be reset.`;

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      code: { type: "string" },
      pair: { type: "string" },
      slot: { type: "string" },
      rarity: { type: "string" },
      show: { type: "string" },
      sort: { type: "string" },
      short: { type: "boolean" },
      send: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const command = values.help ? "help" : positionals[0];
  switch (command) {
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
      await raid(positionals[1], positionals[2], positionals[3]);
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
      await doc(command);
      break;
    case "top":
      await top(positionals[1]);
      break;
    case "talents":
      await talents(positionals[1], positionals[2]);
      break;
    case "stats":
      await stats();
      break;
    case "market":
      await market(positionals.slice(1), values);
      break;
    case "inbox":
      await inbox(positionals.slice(1));
      break;
    case "inv":
      await inventory();
      break;
    case "equip":
      await equip(positionals[1], values.slot);
      break;
    case "scrap":
      await scrap(positionals[1]);
      break;
    case "upgrade":
      await upgrade(positionals.slice(1));
      break;
    case "forge":
      await forge(positionals[1]);
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
    case "help":
      console.log(USAGE);
      break;
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
