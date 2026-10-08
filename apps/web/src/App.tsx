import { BAG_LIMIT, MARKET_MAX_PRICE, PRICE_TAGS, type PriceTag, RARITIES, RESTED_BONUS, type Rarity as RarityName, UPGRADE_COST, priceTag, sellerPayout } from "@dnd/shared";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  type Achievement,
  type Character,
  type Guild,
  type InboxEntry,
  type Item,
  type Leaderboard,
  type Profile,
  type Listing,
  type Market,
  type RankRow,
  type PlayerStats,
  type Quest,
  type Raid,
  type Raids,
  type Shop,
  type Stats,
  type Status,
  type TalentSheet,
  Unauthorized,
  api,
} from "./api.ts";
import { Doc, type DocName } from "./Doc.tsx";
import { Ideas } from "./Ideas.tsx";
import { isMuted, play, setMuted } from "./sound.ts";
import { Tour } from "./Tour.tsx";

const SLOTS = [
  ["head", "Head"], ["chest", "Chest"], ["legs", "Legs"], ["hands", "Hands"], ["feet", "Feet"], ["mainHand", "Main hand"],
  ["offHand", "Off hand"], ["ring1", "Ring"], ["ring2", "Ring"], ["neck", "Neck"], ["ears", "Ears"],
] as const;

function BetaNote({ onOpen }: { onOpen: (doc: DocName) => void }) {
  return (
    <p className="beta" role="note">
      <strong>Beta</strong> · Rules and numbers can still change, progress may be reset.{" "}
      <button type="button" className="link" onClick={() => onOpen("manual")}>Manual</button> ·{" "}
      <button type="button" className="link" onClick={() => onOpen("changelog")}>Changelog</button>
    </p>
  );
}

const minutesUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));

function statParts(s: Stats) {
  return [
    s.attack ? `ATK ${s.attack}` : null,
    s.defense ? `DEF ${s.defense}` : null,
    s.luck ? `LCK +${s.luck}` : null,
    s.fortune ? `FOR +${s.fortune}%` : null,
  ].filter(Boolean) as string[];
}

const STAT_NAMES = { attack: "Attack", defense: "Defense", luck: "Luck", fortune: "Fortune" } as const;
const STAT_KEYS = Object.keys(STAT_NAMES) as (keyof Stats)[];
const statValue = (s: Stats, key: keyof Stats) => (key === "luck" ? `+${s.luck}` : key === "fortune" ? `+${s.fortune}%` : String(s[key]));

/** The non-zero stats of an item, each with its icon. */
function StatList({ stats }: { stats: Stats }) {
  return (
    <span className="stat-list">
      {STAT_KEYS.filter((k) => stats[k]).map((k) => (
        <span key={k} className="stat" title={STAT_NAMES[k]}>
          <img className="icon" src={`/ui/${k}.svg`} alt={STAT_NAMES[k]} width={16} height={16} />
          {statValue(stats, k)}
        </span>
      ))}
    </span>
  );
}

/**
 * Your shown power against a recommendation: green at 100%, yellow from `warn`, red below.
 * Raids pass a higher `warn`, because their odds fall much faster below the recommendation.
 */
function Power({ yours, recommended, warn = 0.75 }: { yours: number; recommended: number; warn?: number }) {
  const tone = yours >= recommended ? "good" : yours >= recommended * warn ? "warn" : "bad";
  return <span className={`power ${tone}`} title="Your combat power / recommended for about 60% odds">⚔ {yours} / {recommended}</span>;
}

function Bar({ filled, total, label }: { filled: number; total: number; label: string }) {
  return (
    <div className="bar" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={i < filled ? "on" : ""} />)}
    </div>
  );
}

/** 16x16 UI icon from public/ui, drawn at 24px. Decorative, the text next to it carries the meaning. */
function UiIcon({ name }: { name: string }) {
  return <img className="icon ui-icon" src={`/ui/${name}.svg`} alt="" width={24} height={24} />;
}

function Gold({ amount }: { amount: number }) {
  return <span className="gold"><UiIcon name="gold" />{amount}</span>;
}

/** 8x8 pixel shapes, one per rarity, so rarity reads without telling the colors apart. */
const RARITY_SHAPES: Record<string, string[]> = {
  common: ["........", "........", "..####..", "..####..", "..####..", "..####..", "........", "........"],
  uncommon: ["........", "..####..", ".######.", ".######.", ".######.", ".######.", "..####..", "........"],
  rare: ["...##...", "..####..", ".######.", "########", "########", ".######.", "..####..", "...##..."],
  epic: ["...##...", "...##...", "..####..", "########", "########", "..####..", "...##...", "...##..."],
  legendary: ["........", "#..##..#", "##.##.##", "########", "########", "########", "########", "........"],
  mythic: ["...#....", "...##...", "..###.#.", "..#####.", ".######.", ".######.", ".######.", "..####.."],
  ancient: ["########", ".######.", "..####..", "...##...", "...##...", "..####..", ".######.", "########"],
  divine: ["...##...", ".#....#.", "..####..", "#.####.#", "#.####.#", "..####..", ".#....#.", "...##..."],
  celestial: ["..####..", ".###....", "###.....", "###.....", "###.....", "###.....", ".###....", "..####.."],
  eternal: ["........", "........", ".##..##.", "#..##..#", "#..##..#", ".##..##.", "........", "........"],
};

/** Rarity shape in the rarity's color, drawn at 16px. */
function RarityIcon({ rarity }: { rarity: string }) {
  const rows = RARITY_SHAPES[rarity] ?? [];
  return (
    <svg className={`rarity-icon ${rarity}`} viewBox="0 0 8 8" width={16} height={16} shapeRendering="crispEdges" role="img" aria-label={rarity}>
      <title>{rarity}</title>
      {rows.flatMap((row, y) => row.split("").map((c, x) => c === "#" && <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />))}
    </svg>
  );
}

function Rarity({ rarity }: { rarity: string }) {
  return <span className={`rarity ${rarity}`}><RarityIcon rarity={rarity} />{rarity}</span>;
}

function ItemIcon({ item }: { item: Item }) {
  return <img className="icon" src={`/items/${item.key}.svg`} alt="" width={48} height={48} />;
}

/** The eleven equipment slots. With `onTakeOff` a click on an item takes it off, without it the grid is read-only. */
function EquipmentSlots({ items, onTakeOff }: { items: Item[]; onTakeOff?: (item: Item) => void }) {
  const bySlot = new Map(items.filter((i) => i.equippedSlot).map((i) => [i.equippedSlot, i]));
  return (
    <div className="slots">
      {SLOTS.map(([slot, label]) => {
        const item = bySlot.get(slot);
        const twoHander = slot === "offHand" && bySlot.get("mainHand")?.type === "twoHanded" ? bySlot.get("mainHand") : undefined;
        if (twoHander) {
          return (
            <div key={slot} className={`slot blocked ${twoHander.rarity}`} title="Blocked by a two-handed weapon">
              <span className="slot-label">2-hand <RarityIcon rarity={twoHander.rarity} /></span>
              <ItemIcon item={twoHander} />
            </div>
          );
        }
        return (
          <div key={slot} className={`slot ${item?.rarity ?? "empty"}`}>
            <span className="slot-label">{label} {item && <RarityIcon rarity={item.rarity} />}</span>
            {item && onTakeOff ? (
              <button type="button" className="slot-item" onClick={() => onTakeOff(item)} title={`${item.name}, click to take off`}>
                <ItemIcon item={item} />
              </button>
            ) : item ? <span className="slot-item" title={item.name}><ItemIcon item={item} /></span> : <span className="slot-empty" />}
            {item && <span className="slot-name">{item.name}</span>}
            {item && <StatList stats={item.stats} />}
          </div>
        );
      })}
    </div>
  );
}

const INSTALL = "npm install -g dungeons-and-deploys";

function Login({ onDone, onOpen }: { onDone: () => void; onOpen: (doc: DocName) => void }) {
  const [pair, setPair] = useState("");
  const [access, setAccess] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<{ form: "login" | "register"; text: string } | null>(null);
  async function submit(e: FormEvent, form: "login" | "register") {
    e.preventDefault();
    try {
      await (form === "login" ? api("/auth/web", { code: pair }) : api("/auth/web/register", { code: access, name: name.trim() }));
      onDone();
    } catch (err) {
      setError({ form, text: (err as Error).message });
    }
  }
  const failed = (form: "login" | "register") => error?.form === form && <p className="error" role="alert">{error.text}</p>;
  return (
    <main className="login">
      <img src="/icon.svg" alt="" width={96} height={96} className="icon" />
      <h1>Dungeons & Deploys</h1>
      <p className="dim">An idle RPG that runs next to your work. Quests, loot, talents, dungeons and raids, in your terminal and here.</p>
      <BetaNote onOpen={onOpen} />
      <form className="panel" onSubmit={(e) => submit(e, "register")}>
        <h2>New here? Start playing</h2>
        <p className="dim">You need an access code from whoever runs the game.</p>
        <label htmlFor="access">Access code</label>
        <input id="access" value={access} onChange={(e) => setAccess(e.target.value)} autoComplete="off" required />
        <label htmlFor="name">Character name</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          pattern="[a-zA-Z0-9_\-]{2,20}"
          title="2-20 letters, digits, _ or -"
          autoComplete="off"
          required
        />
        {failed("register")}
        <button type="submit">Create character</button>
      </form>
      <form className="panel" onSubmit={(e) => submit(e, "login")}>
        <h2>Already playing?</h2>
        <label htmlFor="code">Pair code</label>
        <p className="dim">
          Get a code on a device that is logged in: <strong>Devices</strong> at the top of the website, or <code>quest pair</code> in your terminal.
        </p>
        <input id="code" value={pair} onChange={(e) => setPair(e.target.value)} placeholder="ABCD-EFGH" autoComplete="off" required />
        {failed("login")}
        <button type="submit">Log in</button>
      </form>
      <section className="panel install">
        <h2>Prefer the terminal?</h2>
        <ol>
          <li>Install <a href="https://nodejs.org">Node.js</a> 24 or newer, then <code>{INSTALL}</code></li>
          <li>New player: <code>quest login --code &lt;ACCESS_CODE&gt;</code></li>
          <li>Run <code>quest</code> to start a quest. <code>quest pair</code> logs in this website.</li>
        </ol>
        <p className="dim">
          Claude Code plugin, status line and shell prompt: see the{" "}
          <button type="button" className="link" onClick={() => onOpen("manual")}>manual</button>.
        </p>
      </section>
    </main>
  );
}

/** A pair code and how to use it, to log in this character on another browser, phone, terminal or Claude Code. */
function DevicePair({ onClose, onOpen }: { onClose: () => void; onOpen: (doc: DocName) => void }) {
  const [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState("");
  const create = () => {
    setPair(null);
    setError("");
    void api<{ code: string; expiresAt: string }>("/auth/pair", {}).then(setPair, (err: Error) => setError(err.message));
  };
  useEffect(create, []);
  const code = pair?.code ?? "…";
  return (
    <section className="panel install" aria-label="Log in on another device">
      <div className="row">
        <h2>Log in on another device</h2>
        <button type="button" className="small ghost" onClick={onClose}>Close</button>
      </div>
      <p className="dim">There is no password. A pair code logs in one more device with this character.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="pair-code">
        <code>{code}</code>
        {pair && <span className="dim"> · works once, for {minutesUntil(pair.expiresAt)} minutes</span>}
        <button type="button" className="small ghost" onClick={create}>New code</button>
      </p>
      <h3 className="sub">Another browser or your phone</h3>
      <ol>
        <li>Open this website on the other device.</li>
        <li>Enter <code>{code}</code> under <strong>Already playing?</strong> and click <strong>Log in</strong>.</li>
      </ol>
      <h3 className="sub">Terminal or Claude Code</h3>
      <ol>
        <li>Install <a href="https://nodejs.org">Node.js</a> 24 or newer, then <code>{INSTALL}</code></li>
        <li>Run <code>quest login --pair {code}</code></li>
        <li>Run <code>quest</code> for a quest. The <button type="button" className="link" onClick={() => onOpen("manual")}>manual</button> shows the Claude Code plugin and shell prompt.</li>
      </ol>
      <p className="dim">
        The other way round: <code>quest pair</code> in a logged-in terminal shows a code for this website or another terminal.
        Keep at least two devices logged in, a character without a logged-in device is lost.
      </p>
    </section>
  );
}

/** The current time, refreshed every second while `active`. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const cooling = (status: Status) => !!status.quest?.resolved && new Date(status.readyAt).getTime() > Date.now();

/** Shows the rest in the tab title, so a background tab tells when the next quest is ready. */
function TabTitle({ status }: { status: Status | null }) {
  const now = useNow(!!status && cooling(status));
  useEffect(() => {
    const left = status?.quest?.resolved ? new Date(status.readyAt).getTime() - now : 0;
    document.title = status ? `${left > 0 ? `⏳ ${clock(left)}` : "✓ Quest ready"} · Dungeons & Deploys` : "Dungeons & Deploys";
  }, [status, now]);
  return null;
}

const lootText = (i: Item) => (i.scrapped ? `${i.name} (scrapped for ${i.scrap} gold)` : i.name);

function QuestStatus({ status, onChange }: { status: Status; onChange: () => void }) {
  const q = status.quest;
  const e = status.encounter;
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const now = useNow(cooling(status));
  const left = new Date(status.readyAt).getTime() - now;
  const ready = !q || (q.resolved && left <= 0);
  const rest = q ? new Date(status.readyAt).getTime() - new Date(q.endsAt).getTime() : 0;

  async function act(path: string, describe: (data: never) => string, body: object = {}) {
    try {
      setMessage(describe(await api<never>(path, body)));
    } catch (err) {
      setMessage((err as Error).message);
    }
    onChange();
  }
  const questResult = (r: Quest & { readyAt: string; rested: boolean }) => {
    const rested = r.rested ? ` · rested +${RESTED_BONUS}%` : "";
    return `${r.name}: ${r.success ? `✓ success · +${r.xp} XP · +${r.gold} gold${rested}${r.loot ? ` · found ${lootText(r.loot)}` : ""}` : `✗ failed · +${r.xp} XP${rested}`}`;
  };
  const fightResult = (f: { won: boolean; story: string; xp: number; gold: number; loot: Item | null }) =>
    `${f.won ? `Victory · +${f.xp} XP · +${f.gold} gold${f.loot ? ` · found ${lootText(f.loot)}` : ""}` : "Defeated. It got away, nothing lost."} ${f.story}`;
  const dungeonResult = (d: { code: string }) => `In dungeon ${d.code}. Share the code, others can join until it starts.`;

  return (
    <section className="panel" data-tour="status">
      <h2><UiIcon name="hourglass" />Status</h2>
      {e && (
        <div className="row">
          <p className="alert">⚠ {e.name} (Lv {e.level}) appeared · {Math.round(e.winChance * 100)}% odds · <Power yours={e.power} recommended={e.recommended} /> · leaves in {minutesUntil(e.expiresAt)}m</p>
          <button type="button" className="small" onClick={() => act("/fight", fightResult)}>Fight</button>
        </div>
      )}
      {q && !q.resolved && (
        <>
          <p>⚔ Quest running · {minutesUntil(q.endsAt) ? `${minutesUntil(q.endsAt)}m left` : "rolling the dice"}</p>
          <Bar filled={questProgress(q)} total={9} label="Quest progress" />
        </>
      )}
      {q?.resolved && !ready && (
        <div className="row">
          <div className="cooldown">
            <p className="countdown">Next quest in <strong>{clock(left)}</strong></p>
            <Bar filled={Math.floor((1 - left / rest) * 10)} total={10} label={`Resting, next quest in ${clock(left)}`} />
          </div>
          <button type="button" disabled>Start quest</button>
        </div>
      )}
      {ready && (
        <div className="row">
          <p className="countdown"><strong>{q ? "Quest ready!" : "No quest yet."}</strong> The result comes at once, then 45 minutes rest.</p>
          <button type="button" data-tour="quest" onClick={() => act("/quests", questResult)}>Start quest</button>
        </div>
      )}
      {status.rested > 0 && <p>Rested: the next {status.rested} quests give +{RESTED_BONUS}% XP and gold.</p>}
      {q?.resolved && (
        <p>
          Last quest: {q.name} · {q.success ? `✓ success · +${q.xp} XP · +${q.gold} gold` : `✗ failed · +${q.xp} XP`}
          {q.loot && <> · found <span className={q.loot.rarity}><RarityIcon rarity={q.loot.rarity} />{q.loot.name}</span></>}
        </p>
      )}
      {q?.story && <p className="dim">{q.story}</p>}
      {status.dungeon?.state === "lobby" && (
        <p>Dungeon <code>{status.dungeon.code}</code> starts in {minutesUntil(status.dungeon.startsAt)}m · party: {status.dungeon.members.join(", ")}</p>
      )}
      {status.dungeon?.state === "running" && (
        <p>
          Dungeon stage {status.dungeon.cleared + 1}/4 · {status.dungeon.current} ·{" "}
          <Power yours={status.dungeon.power[status.dungeon.cleared]} recommended={status.dungeon.recommended[status.dungeon.cleared]} /> · {minutesUntil(status.dungeon.stageEndsAt ?? "")}m left
        </p>
      )}
      {status.dungeon && <p className="dim">{status.dungeon.story}</p>}
      {!status.dungeon && (
        <div className="row">
          <p>No dungeon. Open a lobby for up to 5 players, or join one with a code.</p>
          <form className="donate" onSubmit={(e) => { e.preventDefault(); void act("/dungeons/join", dungeonResult, { code }); }}>
            <button type="button" className="small" onClick={() => act("/dungeons", dungeonResult)}>Start dungeon</button>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Dungeon code" aria-label="Dungeon code" required />
            <button type="submit" className="small">Join</button>
          </form>
        </div>
      )}
      {message && <p role="status" className="dim">{message}</p>}
    </section>
  );
}

/** Elapsed share of a running quest as 0-9 blocks. */
function questProgress(q: Quest) {
  const start = new Date(q.startedAt).getTime();
  const share = (Date.now() - start) / (new Date(q.endsAt).getTime() - start);
  return Math.floor(Math.min(1, Math.max(0, share)) * 9);
}

/** Price form for listing a bag item, prefilled with its suggested value. */
function SellForm({ item, onDone, onCancel }: { item: Item; onDone: () => void; onCancel: () => void }) {
  const [price, setPrice] = useState(String(item.value));
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<{ price: number; sales: number }>();
  useEffect(() => void api<Record<string, { price: number; sales: number }>>("/market/prices").then((p) => setRecent(p[item.rarity])), [item.rarity]);
  const amount = Number(price);
  const tag = amount > 0 ? priceTag(amount, item.value) : null;
  return (
    <form
      className="sell"
      onSubmit={(e) => {
        e.preventDefault();
        api(`/market/list/${item.id}`, { price: amount }).then(onDone, (err: Error) => setError(err.message));
      }}
    >
      <label htmlFor={`price-${item.id}`}>Price</label>
      <input id={`price-${item.id}`} type="number" min={1} max={MARKET_MAX_PRICE} step={1} value={price} onChange={(e) => setPrice(e.target.value)} required />
      {tag && <span className="dim">you get <Gold amount={sellerPayout(amount)} /> · <PriceTagLabel tag={tag} /></span>}
      <button type="submit" className="small">List</button>
      <button type="button" className="small ghost" onClick={onCancel}>Cancel</button>
      <span className="dim">
        Suggested {item.value}g.{recent && ` ${item.rarity} sold for ${recent.price}g on average in 7 days (${recent.sales}×).`} Buyers line up for 30 minutes, then one is drawn.
      </span>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

function PriceTagLabel({ tag }: { tag: PriceTag }) {
  return <span className={`tag ${tag}`}>{PRICE_TAGS[tag]}</span>;
}

function Inventory({ items, shards, autoScrap, onChange }: { items: Item[]; shards: Record<string, number>; autoScrap: string | null; onChange: () => void }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selling, setSelling] = useState<number | null>(null);
  const [picks, setPicked] = useState<number[]>([]);
  const act = (path: string) => api(path, {}).then(onChange, (err: Error) => setError(err.message));
  const make = (path: string, body: object = {}) =>
    api<{ item: Item }>(path, body).then(({ item }) => { setPicked([]); setMessage(`You got ${item.name} (${item.rarity}).`); onChange(); }, (err: Error) => setError(err.message));
  const bag = items.filter((i) => !i.equippedSlot);
  // Drops picks that were scrapped, equipped or listed meanwhile.
  const picked = picks.filter((id) => bag.some((i) => i.id === id && !i.listed));
  const pickedRarity = bag.find((i) => i.id === picked[0])?.rarity;
  const nextRarity = pickedRarity && RARITIES[RARITIES.indexOf(pickedRarity as RarityName) + 1];
  const canPick = (i: Item) => !i.listed && i.rarity !== "eternal" && (!pickedRarity || i.rarity === pickedRarity);
  const togglePick = (id: number) => setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : picked.length < UPGRADE_COST ? [...picked, id] : picked);
  return (
    <>
      <section className="panel" data-tour="equipment">
        <h2><UiIcon name="equipment" />Equipment</h2>
        {error && <p className="error" role="alert">{error}</p>}
        <EquipmentSlots items={items} onTakeOff={(item) => act(`/inventory/${item.id}/unequip`)} />
      </section>
      <section className="panel">
        <h2><UiIcon name="bag" />Bag · {bag.length} <span className="dim">· {items.length} of {BAG_LIMIT} items</span></h2>
        {items.length >= BAG_LIMIT && <p className="alert">Your bag is full. New loot is scrapped for gold until you scrap or sell something.</p>}
        <label className="dim">
          Auto-scrap loot below{" "}
          <select value={autoScrap ?? ""} onChange={(e) => api("/inventory/auto-scrap", { rarity: e.target.value || null }).then(onChange, (err: Error) => setError(err.message))}>
            <option value="">off</option>
            {RARITIES.slice(1).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        {bag.length === 0 && <p className="dim">Empty. Successful quests and won fights drop items.</p>}
        {message && <p role="status">{message}</p>}
        {Object.keys(shards).length > 0 && (
          <p className="item-actions">
            Shards:
            {RARITIES.filter((r) => shards[r]).map((r) => (
              <button key={r} type="button" className="small ghost" title={`Forge a random ${r} item`} onClick={() => make(`/inventory/shards/${r}/forge`)}>
                <RarityIcon rarity={r} /> {shards[r]}× {r} · Forge
              </button>
            ))}
          </p>
        )}
        {picked.length > 0 && (
          <p className="item-actions">
            {picked.length} of {UPGRADE_COST} {pickedRarity} picked
            <button type="button" className="small" disabled={picked.length < UPGRADE_COST} onClick={() => make("/inventory/upgrade", { ids: picked })}>
              Fuse into a random {nextRarity} item
            </button>
            <button type="button" className="small ghost" onClick={() => setPicked([])}>Cancel</button>
          </p>
        )}
        <ul className="items">
          {bag.map((item) => (
            <li key={item.id} className={item.rarity}>
              <ItemIcon item={item} />
              <div className="item-text">
                <span className="name">{item.name}</span>
                <span className="dim"><Rarity rarity={item.rarity} /> · <StatList stats={item.stats} />{item.listed ? <> · on market for <Gold amount={item.price ?? 0} /></> : ""}</span>
              </div>
              <span className="item-actions">
                {!item.listed && <button type="button" className="small" onClick={() => act(`/inventory/${item.id}/equip`)}>Equip</button>}
                {canPick(item) && (
                  <button type="button" className="small ghost" aria-pressed={picked.includes(item.id)} title={`Fuse ${UPGRADE_COST} items of one rarity into a random item of the next`} onClick={() => togglePick(item.id)}>
                    {picked.includes(item.id) ? "Picked" : "Upgrade"}
                  </button>
                )}
                {item.listed ? (
                  <button type="button" className="small ghost" onClick={() => act(`/market/unlist/${item.id}`)}>Unlist</button>
                ) : (
                  <>
                    <button type="button" className="small ghost" aria-expanded={selling === item.id} onClick={() => setSelling(selling === item.id ? null : item.id)}>Sell</button>
                    <button
                      type="button"
                      className="small ghost"
                      onClick={() => confirm(`Scrap ${item.name} for ${item.scrap} gold? It is gone for good.`) && act(`/inventory/${item.id}/scrap`)}
                    >
                      Scrap {item.scrap}g
                    </button>
                  </>
                )}
              </span>
              {selling === item.id && (
                <SellForm item={item} onCancel={() => setSelling(null)} onDone={() => { setSelling(null); onChange(); }} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function History({ quests }: { quests: Quest[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? quests : quests.slice(0, 5);
  return (
    <section className="panel">
      <div className="row">
        <h2><UiIcon name="scroll" />Quest history</h2>
        {quests.length > 5 && (
          <button type="button" className="small ghost" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show last ${quests.length}`}
          </button>
        )}
      </div>
      {quests.length === 0 ? <p className="dim">No finished quests yet.</p> : (
        <div className="scroll">
          <table>
            <thead><tr><th>Started</th><th>Result</th><th>XP</th><th>Gold</th><th>Loot</th></tr></thead>
            <tbody>
              {shown.map((q) => (
                <tr key={q.startedAt}>
                  <td>{new Date(q.startedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{q.success ? "✓" : "✗"}</td>
                  <td>{q.xp}</td>
                  <td>{q.gold}</td>
                  <td>{q.loot ? <span className={q.loot.rarity}><RarityIcon rarity={q.loot.rarity} />{q.loot.name}</span> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Every guild to compare before joining. Join codes stay private, a member has to share theirs. */
function GuildList() {
  const [guilds, setGuilds] = useState<RankRow[] | null>(null);
  useEffect(() => void api<Leaderboard>("/leaderboard?board=guilds").then((b) => setGuilds(b.top)), []);
  if (!guilds?.length) return null;
  return (
    <>
      <h3 className="sub">Guilds · ask a member for the join code</h3>
      <div className="scroll">
        <table>
          <thead><tr><th>Guild</th><th>Level</th><th>Members</th><th>Ø Power</th></tr></thead>
          <tbody>
            {guilds.map((g) => (
              <tr key={g.name}><td>{g.name}</td><td>{g.level}</td><td>{g.members}</td><td>{g.power}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GuildHall({ guild, raids, me, onChange }: { guild: Guild | null; raids: Raids; me: string; onChange: () => void }) {
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [message, setMessage] = useState("");
  async function act(path: string, body: object) {
    try {
      await api(path, body);
      setMessage("");
      setAmount("");
      setName("");
      setCode("");
      onChange();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }
  const leader = guild?.members.some((m) => m.name === me && m.role === "leader");
  const canSchedule = leader && !["scheduled", "running"].includes(raids.raid?.state ?? "");
  return (
    <section className="panel">
      <h2><UiIcon name="guild" />Guild hall</h2>
      {!guild ? (
        <>
          <p className="dim">No guild yet. Found one and become its leader, or join with a code from a guild member.</p>
          <form className="donate" onSubmit={(e) => { e.preventDefault(); void act("/guild", { name }); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guild name" aria-label="Guild name" pattern="[a-zA-Z0-9 _\-]{3,24}" title="3 to 24 letters, digits, spaces, _ or -" required />
            <button type="submit" className="small">Found</button>
          </form>
          <form className="donate" onSubmit={(e) => { e.preventDefault(); void act("/guild/join", { code }); }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Join code" aria-label="Join code" required />
            <button type="submit" className="small">Join</button>
          </form>
          {message && <p className="error" role="alert">{message}</p>}
          <GuildList />
        </>
      ) : (
        <>
          <p>{guild.name} · Lv {guild.level} · {guild.members.length} members · join code <code>{guild.code}</code></p>
          <Bar filled={Math.floor((guild.xpIntoLevel / guild.xpForNext) * 10)} total={10} label={`${guild.xpIntoLevel} of ${guild.xpForNext} guild XP`} />
          <ul className="members">
            {guild.members.map((m) => (
              <li key={m.name}>
                <span>{m.role === "leader" ? "♛ " : ""}{m.name}</span>
                <span className="dim">Lv {m.level} · donated <Gold amount={m.donated} /></span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="small"
            onClick={() => {
              const warning = guild.members.length === 1 ? "You are the last member, the guild will be dissolved." : leader ? "The longest-standing member becomes leader." : "";
              if (confirm(`Leave ${guild.name}? ${warning}`)) void act("/guild/leave", {});
            }}
          >
            Leave guild
          </button>
          <h3 className="sub">Guild bank · <Gold amount={guild.gold} /></h3>
          <p className="dim">Every quest adds 10% of its gold to the bank, on top of your own reward. Donations help too.</p>
          <form className="donate" onSubmit={(e) => { e.preventDefault(); void act("/guild/donate", { amount: Number(amount) }); }}>
            <input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Gold" aria-label="Gold to donate" required />
            <button type="submit" className="small">Donate</button>
          </form>
          {message && <p className="error" role="alert">{message}</p>}
          <h3 className="sub">Buffs · 24h for every member{leader ? "" : " · the leader activates them"}</h3>
          <ul className="buffs">
            {guild.buffs.map((b) => (
              <li key={b.key} className={b.endsAt ? "active" : b.unlocked ? "" : "locked"}>
                <span><strong>{b.name}</strong> · {b.text}<br /><em className="dim">{b.flavor}</em></span>
                {b.endsAt ? (
                  <span className="good">active · {Math.ceil(minutesUntil(b.endsAt) / 60)}h left</span>
                ) : !b.unlocked ? (
                  <span className="dim">guild Lv {b.level}</span>
                ) : leader ? (
                  <button type="button" className="small" disabled={guild.gold < b.cost} onClick={() => act("/guild/buffs", { key: b.key })}>
                    <Gold amount={b.cost} />
                  </button>
                ) : (
                  <span className="dim"><Gold amount={b.cost} /></span>
                )}
              </li>
            ))}
          </ul>
          <h3 className="sub">Raid bosses · {leader ? "schedule a raid, members join until it starts" : "the leader schedules raids"}</h3>
          {canSchedule && (
            <div className="donate">
              <label htmlFor="raid-minutes">Starts in</label>
              <input id="raid-minutes" type="number" min={5} max={1440} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              <span className="dim">minutes</span>
            </div>
          )}
          <ul className="buffs">
            {raids.bosses.map((b) => (
              <li key={b.tier} className={b.unlocked ? "" : "locked"}>
                <span><strong>{b.tier + 1}. {b.name}</strong><br /><em className="dim">{b.flavor}</em></span>
                {b.unlocked ? (
                  <span className="item-actions">
                    <Power yours={raids.power} recommended={b.recommended} warn={0.9} />
                    {canSchedule && (
                      <button type="button" className="small" onClick={() => act("/raids", { startsInMinutes: Number(minutes), tier: b.tier })}>Schedule</button>
                    )}
                  </span>
                ) : <span className="dim">beat the boss before · ⚔ {b.recommended}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function RaidView({ raid, power, me, onChange }: { raid: Raid; power: number; me: string; onChange: () => void }) {
  const [error, setError] = useState("");
  const join = () => api("/raids/join", {}).then(onChange, (err: Error) => setError(err.message));
  const joined = raid.members.some((m) => m.name === me);
  const label = {
    scheduled: `starts in ${minutesUntil(raid.startsAt)}m · ${raid.members.length}/${raid.minPlayers} raiders needed`,
    running: `tick ${raid.tick}/${raid.ticks} · ends in ${minutesUntil(raid.endsAt)}m · stay present to deal damage`,
    won: "defeated · loot for every raider",
    failed: "the boss survived",
    cancelled: `cancelled, fewer than ${raid.minPlayers} raiders`,
  }[raid.state];
  const top = Math.max(1, ...raid.members.map((m) => m.damage));
  return (
    <section className={`panel raid ${raid.state}`}>
      <h2><UiIcon name="raid" />Raid · {raid.boss}</h2>
      <div className="row">
        <p>{label} · <Power yours={power} recommended={raid.recommended} warn={0.9} /></p>
        {raid.state === "scheduled" && !joined && <button type="button" className="small" onClick={join}>Join raid</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="dim">{raid.story}</p>
      {raid.bossMaxHp > 0 && (
        <>
          <Bar filled={Math.ceil((raid.bossHp / raid.bossMaxHp) * 20)} total={20} label={`Boss HP ${raid.bossHp} of ${raid.bossMaxHp}`} />
          <p className="dim">HP {raid.bossHp}/{raid.bossMaxHp}</p>
        </>
      )}
      <ul className="members">
        {raid.members.map((m) => (
          <li key={m.name}>
            <span>{m.name}</span>
            <span className="damage"><span style={{ width: `${(m.damage / top) * 100}%` }} /></span>
            <span className="dim">{m.damage}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShopView({ onChange }: { onChange: () => void }) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(() => api<Shop>("/shop").then(setShop), []);
  useEffect(() => void load(), [load]);
  async function buy(offer: number) {
    try {
      const { item } = await api<{ item: Item }>("/shop/buy", { offer });
      setMessage(`Bought ${item.name} · ${statParts(item.stats).join(" · ")}`);
      onChange();
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }
  if (!shop) return <section className="panel"><p>Loading…</p></section>;
  return (
    <section className="panel">
      <h2><UiIcon name="shop" />Shop · <Gold amount={shop.gold} /></h2>
      <p className="dim">Three new offers every day, new ones in {Math.ceil(minutesUntil(shop.refreshesAt) / 60)}h.</p>
      <p className="legend dim">Rarity, common to rarest: {Object.keys(RARITY_SHAPES).map((r) => <Rarity key={r} rarity={r} />)}</p>
      {message && <p role="status">{message}</p>}
      <div className="offers">
        {shop.offers.map((o) => (
          <div key={o.offer} className={`offer ${o.rarity}`}>
            <img className="icon" src={`/items/${o.key}.svg`} alt="" width={64} height={64} />
            <span className="name">{o.name}</span>
            <span className="dim"><Rarity rarity={o.rarity} /> · <Gold amount={o.price} /></span>
            <StatList stats={o.stats} />
            <button type="button" className="small" disabled={o.bought || shop.gold < o.price} onClick={() => buy(o.offer)}>
              {o.bought ? "Bought" : "Buy"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

const ITEM_TYPE_LABELS: [string, string][] = [
  ["helm", "Head"], ["chest", "Chest"], ["legs", "Legs"], ["gloves", "Hands"], ["boots", "Feet"], ["weapon", "One-handed"],
  ["twoHanded", "Two-handed"], ["shield", "Shield"], ["ring", "Ring"], ["necklace", "Neck"], ["earrings", "Ears"],
];

function ListingCard({ listing: l, gold, now, onAct }: { listing: Listing; gold: number; now: number; onAct: (path: string, done: string) => void }) {
  const left = new Date(l.drawAt).getTime() - now;
  const phase = l.phase === "draw" && left <= 0 ? "drawing" : l.phase;
  const line = `${l.bidders} in line`;
  return (
    <div className={`offer listing ${l.item.rarity}`}>
      <ItemIcon item={l.item} />
      <span className="name">{l.item.name}</span>
      <span className="dim"><Rarity rarity={l.item.rarity} /> · <StatList stats={l.item.stats} /></span>
      <span><Gold amount={l.price} /> <PriceTagLabel tag={l.tag} /></span>
      <span className="dim">{l.mine ? "your listing" : `by ${l.seller}`} · worth about {l.value}g</span>
      <span className="dim">{phase === "draw" ? `draw in ${clock(left)} · ${line}` : phase === "drawing" ? `drawing… · ${line}` : "no line · first come, first served"}</span>
      {l.mine ? (
        <button type="button" className="small ghost" disabled={l.bidders > 0} title={l.bidders ? "Buyers are in line, it gets drawn" : undefined} onClick={() => onAct(`/market/unlist/${l.item.id}`, "Taken off the market.")}>
          Unlist
        </button>
      ) : phase === "draw" && l.joined ? (
        <button type="button" className="small ghost" onClick={() => onAct(`/market/leave/${l.item.id}`, `You left the line for ${l.item.name}, your ${l.price} gold are back.`)}>Leave line</button>
      ) : phase === "draw" ? (
        <button type="button" className="small" disabled={gold < l.price} onClick={() => onAct(`/market/buy/${l.item.id}`, `You are in line for ${l.item.name}, ${l.price} gold are reserved until the draw.`)}>
          Join line
        </button>
      ) : phase === "drawing" ? (
        <button type="button" className="small" disabled>Drawing…</button>
      ) : (
        <button type="button" className="small" disabled={gold < l.price} onClick={() => onAct(`/market/buy/${l.item.id}`, `You bought ${l.item.name}. It is in your bag.`)}>Buy now</button>
      )}
    </div>
  );
}

function MarketView({ onChange }: { onChange: () => void }) {
  const [filter, setFilter] = useState({ rarity: "", type: "", show: "", sort: "ending" });
  const [market, setMarket] = useState<Market | null>(null);
  const [message, setMessage] = useState("");
  const query = new URLSearchParams({
    sort: filter.sort,
    ...(filter.rarity && { rarity: filter.rarity }),
    ...(filter.type && { type: filter.type }),
    ...(filter.show === "mine" ? { mine: "true" } : filter.show ? { phase: filter.show } : {}),
  }).toString();
  const load = useCallback(() => api<Market>(`/market?${query}`).then(setMarket), [query]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);
  const now = useNow(!!market?.listings.some((l) => l.phase === "draw"));

  async function act(path: string, done: string) {
    try {
      await api(path, {});
      setMessage(done);
      onChange();
    } catch (err) {
      setMessage((err as Error).message);
    }
    await load();
  }
  const select = (key: keyof typeof filter, label: string, options: [string, string][]) => (
    <label>
      {label}
      <select value={filter[key]} onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );

  return (
    <section className="panel">
      <h2><UiIcon name="bag" />Market{market && <> · <Gold amount={market.gold} /></>}</h2>
      <p className="dim">
        New listings collect buyers for 30 minutes, then one of them is drawn. Joining the line reserves the price, the others get it back.
        Without a line an item can be bought at once. Sell from your bag, the seller pays a 10% fee.
      </p>
      <div className="filters">
        {select("rarity", "Rarity", [["", "All"], ...Object.keys(RARITY_SHAPES).map((r): [string, string] => [r, r])])}
        {select("type", "Slot", [["", "All"], ...ITEM_TYPE_LABELS])}
        {select("show", "Show", [["", "All listings"], ["draw", "Line open"], ["buy", "Buy now"], ["mine", "My listings"]])}
        {select("sort", "Sort", [["ending", "Oldest first"], ["price", "Cheapest first"]])}
      </div>
      {message && <p role="status">{message}</p>}
      {!market ? <p>Loading…</p> : market.listings.length === 0 ? <p className="dim">Nothing listed that matches.</p> : (
        <div className="offers market">
          {market.listings.map((l) => <ListingCard key={l.item.id} listing={l} gold={market.gold} now={now} onAct={act} />)}
        </div>
      )}
    </section>
  );
}

const INBOX_ICONS: Record<string, string> = { market: "bag", dungeon: "hourglass", raid: "raid", guild: "guild", achievement: "star" };

/** What happened to the character, newest first. Opening it marks everything read. */
function InboxView({ onChange }: { onChange: () => void }) {
  const [entries, setEntries] = useState<InboxEntry[] | null>(null);
  const load = useCallback(() => api<{ notifications: InboxEntry[] }>("/inbox").then((r) => setEntries(r.notifications)), []);
  useEffect(() => void load().then(onChange), [load, onChange]);
  const remove = (path: string) => void api(path, {}).then(load).then(onChange);
  if (!entries) return <section className="panel"><p>Loading…</p></section>;
  return (
    <section className="panel">
      <div className="row">
        <h2><UiIcon name="mail" />Inbox · {entries.length}</h2>
        {entries.length > 0 && (
          <button type="button" className="small ghost" onClick={() => confirm("Delete every entry? This cannot be undone.") && remove("/inbox/clear")}>Clear all</button>
        )}
      </div>
      {entries.length === 0 ? <p className="dim">Nothing new. Sales, draws, dungeons, raids, guild news and achievements show up here.</p> : (
        <ul className="inbox">
          {entries.map((n) => (
            <li key={n.id} className={n.unread ? "unread" : ""}>
              <UiIcon name={INBOX_ICONS[n.kind] ?? "scroll"} />
              <span>
                {n.text}
                <span className="dim"> · {new Date(n.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
              </span>
              <button type="button" className="small ghost" onClick={() => remove(`/inbox/delete/${n.id}`)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TalentsView({ onChange }: { onChange: () => void }) {
  const [sheet, setSheet] = useState<TalentSheet | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => void api<TalentSheet>("/talents").then(setSheet), []);
  async function act(path: string, body: object = {}) {
    try {
      setSheet(await api<TalentSheet>(path, body));
      setMessage("");
      onChange();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }
  if (!sheet) return <section className="panel"><p>Loading…</p></section>;
  const maxed = (key: string | null) => sheet.talents.some((t) => t.key === key && t.rank === t.max);
  return (
    <section className="panel" onKeyDown={(e) => e.key === "Escape" && setOpen(null)}>
      <h2><UiIcon name="star" />Talents · {sheet.points - sheet.spent} of {sheet.points} points free</h2>
      <div className="row">
        <p className="dim">One point per level. Each row opens after 5 more points in its tree, arrows need the talent above maxed.</p>
        <button
          type="button"
          className="small ghost"
          disabled={!sheet.spent || sheet.gold < sheet.resetCost}
          onClick={() => confirm(`Reset all talents for ${sheet.resetCost} gold?`) && act("/talents/reset")}
        >
          Reset · <Gold amount={sheet.resetCost} />
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      <div className="trees">
        {sheet.trees.map(({ tree, spent }) => (
          <div key={tree} className="tree">
            <h3>{tree} <span className="dim">· {spent}</span></h3>
            <div className="talent-grid">
              {sheet.talents.filter((t) => t.tree === tree).map((t) => {
                const locked = !!t.error?.startsWith("needs");
                const state = t.rank === t.max ? "maxed" : locked ? "locked" : "open";
                return (
                  <div
                    key={t.key}
                    className={`talent ${state} col-${t.col} ${t.requires ? "arrow" : ""} ${maxed(t.requires) ? "lit" : ""}`}
                    data-tour={`talent-${t.key}`}
                    style={{ gridRow: t.row + 1, gridColumn: t.col + 1 }}
                  >
                    <button
                      type="button"
                      className="tile"
                      aria-expanded={open === t.key}
                      aria-label={`${t.name}, rank ${t.rank} of ${t.max}`}
                      onClick={() => setOpen(open === t.key ? null : t.key)}
                    >
                      <img src={`/talents/${t.key}.svg`} alt="" width={40} height={40} />
                      <span className="rank">{t.rank}/{t.max}</span>
                    </button>
                    {open === t.key && (
                      <div className="popover" role="dialog" aria-label={t.name} data-tour="talent-details">
                        <strong>{t.name}</strong>
                        <span className="dim">Rank {t.rank}/{t.max}</span>
                        {t.current && <span>Now: {t.current}</span>}
                        {t.next && <span className="next">{t.rank ? "Next rank" : "First rank"}: {t.next}</span>}
                        {locked && <span className="bad">{t.error}</span>}
                        <em className="dim">{t.flavor}</em>
                        {t.rank < t.max && (
                          <button type="button" className="small" data-tour="learn" disabled={!!t.error} onClick={() => act("/talents/learn", { key: t.key })}>Learn</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const STAT_LABELS: [string, string][] = [
  ["questsWon", "Quests won"], ["questsFailed", "Quests failed"], ["longestStreak", "Longest win streak"],
  ["goldEarned", "Gold earned"], ["monstersSlain", "Monsters slain"], ["fightsLost", "Fights lost"], ["itemsFound", "Items found"],
  ["legendariesFound", "Legendaries found"], ["dungeonsCleared", "Dungeons cleared"], ["raidsWon", "Raids won"], ["marketSold", "Items sold"],
  ["marketBought", "Items bought"], ["shopBought", "Shop purchases"],
];

function StatsView() {
  const [data, setData] = useState<{ stats: PlayerStats; achievements: Achievement[] } | null>(null);
  useEffect(() => void api<{ stats: PlayerStats; achievements: Achievement[] }>("/stats").then(setData), []);
  if (!data) return <section className="panel"><p>Loading…</p></section>;
  const done = data.achievements.filter((a) => a.unlockedAt).length;
  return (
    <>
      <section className="panel">
        <h2><UiIcon name="stats" />Statistics</h2>
        <dl className="stats">
          {STAT_LABELS.map(([key, label]) => (
            <div key={key}><dt>{label}</dt><dd>{String(data.stats[key])}</dd></div>
          ))}
        </dl>
      </section>
      <section className="panel">
        <h2><UiIcon name="star" />Achievements · {done}/{data.achievements.length}</h2>
        <ul className="achievements">
          {data.achievements.map((a) => (
            <li key={a.key} className={a.unlockedAt ? "unlocked" : ""}>
              <span className="star" aria-hidden="true">{a.unlockedAt ? "★" : "☆"}</span>
              <span>
                <strong>{a.name}</strong>
                <span className="dim">
                  {a.description} · {a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString() : "locked"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

const BOARDS = [["xp", "Level"], ["power", "Power"], ["achievements", "Achievements"], ["guilds", "Guilds"]] as const;

function RanksView({ onProfile }: { onProfile: (name: string) => void }) {
  const [board, setBoard] = useState<(typeof BOARDS)[number][0]>("xp");
  const [data, setData] = useState<Leaderboard | null>(null);
  useEffect(() => void api<Leaderboard>(`/leaderboard?board=${board}`).then(setData), [board]);
  const unit = { xp: "XP", power: "Power", achievements: "Achievements", guilds: "XP" }[board];
  const showYou = data?.you && !data.top.some((r) => r.rank === data.you?.rank && r.name === data.you?.name);
  return (
    <section className="panel">
      <h2><UiIcon name="crown" />Leaderboard</h2>
      <div className="tabs">
        {BOARDS.map(([key, label]) => (
          <button key={key} type="button" className={`small ${board === key ? "" : "ghost"}`} aria-pressed={board === key} onClick={() => setBoard(key)}>
            {label}
          </button>
        ))}
      </div>
      {!data ? <p>Loading…</p> : (
        <div className="scroll">
          <table>
            <thead><tr><th>#</th><th>Name</th>{board !== "achievements" && <th>Level</th>}<th>{unit}</th>{board === "guilds" && <><th>Members</th><th>Ø Power</th></>}</tr></thead>
            <tbody>
              {[...data.top, ...(showYou && data.you ? [data.you] : [])].map((r) => (
                <tr key={`${r.rank}-${r.name}`} className={r.name === data.you?.name ? "you" : ""}>
                  <td>{r.rank}</td>
                  <td>{board === "guilds" ? r.name : <button type="button" className="link" title={`Profile of ${r.name}`} onClick={() => onProfile(r.name)}>{r.name}</button>}</td>
                  {board !== "achievements" && <td>{r.level}</td>}<td>{r.value}</td>
                  {board === "guilds" && <><td>{r.members}</td><td>{r.power}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && !data.you && <p className="dim">{board === "guilds" ? "You are not in a guild yet." : "No achievements yet."}</p>}
    </section>
  );
}

type View = "character" | "talents" | "shop" | "market" | "stats" | "ranks" | "ideas" | "profile" | DocName;

/** A player's public profile: level, combat power, stats and equipment. */
function ProfileView({ name, onBack }: { name: string; onBack: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setProfile(null);
    setError("");
    void api<Profile>(`/profile/${encodeURIComponent(name)}`).then(setProfile, (err: Error) => setError(err.message));
  }, [name]);
  return (
    <>
      <button type="button" className="small ghost back" onClick={onBack}>← Back</button>
      {error ? <section className="panel"><p className="error" role="alert">{error}</p></section> : !profile ? <section className="panel"><p>Loading…</p></section> : (
        <>
          <section className="panel">
            <h2><UiIcon name="star" />{profile.name}{profile.mine && <span className="dim"> · your public profile</span>}</h2>
            <dl className="stats hero-stats">
              {[
                { icon: "star", label: "Level", value: profile.level },
                { icon: "power", label: "Power", value: profile.power },
                ...STAT_KEYS.map((k) => ({ icon: k, label: STAT_NAMES[k], value: statValue(profile.stats, k) })),
                { icon: "guild", label: "Guild", value: profile.guild ?? "–" },
                { icon: "crown", label: "Achievements", value: profile.achievements },
              ].map(({ icon, label, value }) => (
                <div key={label}>
                  <dt><img className="icon" src={`/ui/${icon}.svg`} alt="" width={16} height={16} />{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <Bar filled={Math.floor((profile.xpIntoLevel / profile.xpForNext) * 10)} total={10} label={`${profile.xpIntoLevel} of ${profile.xpForNext} XP`} />
            <p className="dim">XP {profile.xpIntoLevel}/{profile.xpForNext} · {profile.xp} total</p>
          </section>
          <section className="panel">
            <h2><UiIcon name="equipment" />Equipment</h2>
            <EquipmentSlots items={profile.equipment} />
          </section>
        </>
      )}
    </>
  );
}

type Data = { character: Character; status: Status; items: Item[]; shards: Record<string, number>; autoScrap: string | null; history: Quest[]; guild: Guild | null; raids: Raids };

const questReady = (s: Status) => !s.quest || (s.quest.resolved && !minutesUntil(s.readyAt));

/** Plays a short sound for what changed since the last refresh. */
function announce(prev: Data, next: Data) {
  if (!questReady(prev.status) && questReady(next.status)) play("questReady");
  if (!prev.status.encounter && next.status.encounter) play("monster");

  const dungeonWas = prev.status.dungeon?.state;
  const dungeonIs = next.status.dungeon?.state;
  if (dungeonWas === "lobby" && dungeonIs === "running") play("start");
  // A finished dungeon drops out of the status, its result comes from the dungeon route.
  if (dungeonWas === "running" && !dungeonIs) {
    void api<{ dungeon: { state: string } | null }>("/dungeons/current").then(({ dungeon }) => play(dungeon?.state === "won" ? "won" : "lost"));
  }

  const raidWas = prev.raids.raid?.state;
  const raidIs = next.raids.raid?.state;
  if (raidWas !== raidIs) {
    if (raidIs === "running") play("start");
    if (raidIs === "won") play("won");
    if (raidIs === "failed") play("lost");
  }
}

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);
  const [view, setView] = useState<View>("character");
  const [profileName, setProfileName] = useState("");
  const [profileFrom, setProfileFrom] = useState<View>("ranks");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [touring, setTouring] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const last = useRef<Data | null>(null);

  const lastFull = useRef(0);
  /**
   * Polls fetch only the character, status, raid and guild. Bag and history change mostly through actions, which
   * reload everything. A poll fetches them too when the character changed (a quest from the terminal, a sale,
   * dungeon loot) and at least every 5 minutes.
   */
  const load = useCallback(async (full = true) => {
    try {
      const [character, status, raid, guild] = await Promise.all([
        api<Character>("/character"),
        api<Status>("/quests/current"),
        api<Raids>("/raids/current"),
        api<{ guild: Guild | null }>("/guild"),
      ]);
      // Read after the fetch, so a reload that finished meanwhile is not overwritten with older data.
      const prev = last.current;
      const changed =
        full || !prev || Date.now() - lastFull.current > 5 * 60_000 ||
        prev.character.xp !== character.xp || prev.character.gold !== character.gold || prev.character.unread !== character.unread ||
        prev.status.quest?.startedAt !== status.quest?.startedAt;
      let rest = prev && { items: prev.items, shards: prev.shards, autoScrap: prev.autoScrap, history: prev.history };
      if (changed || !rest) {
        const [inventory, history] = await Promise.all([api<{ items: Item[]; shards: Record<string, number>; autoScrap: string | null }>("/inventory"), api<Quest[]>("/quests/history")]);
        rest = { items: inventory.items, shards: inventory.shards, autoScrap: inventory.autoScrap, history };
        lastFull.current = Date.now();
      }
      const next = { character, status, raids: raid, guild: guild.guild, ...rest };
      if (last.current) announce(last.current, next);
      last.current = next;
      setData(next);
      setLoggedOut(false);
    } catch (err) {
      if (err instanceof Unauthorized) setLoggedOut(true);
    }
  }, []);

  const reload = useCallback(() => void load(), [load]);

  // An open tab counts as a heartbeat once a minute, so monsters can show up here too.
  // A second over the server's one-per-minute limit, so timer jitter does not run into a 429.
  useEffect(() => {
    if (loggedOut) return;
    const beat = () => void api("/heartbeat", {}).catch(() => {});
    beat();
    const timer = setInterval(beat, 61_000);
    return () => clearInterval(timer);
  }, [loggedOut]);

  // New players get the tour once. Skipping or finishing it is stored, so it does not come back on reload.
  const tour = data?.character.tour;
  useEffect(() => {
    if (tour === "new") setTouring(true);
  }, [tour]);
  const endTour = (done: boolean) => {
    setTouring(false);
    setView("character");
    void api("/tour", { done }).then(() => load(), () => {});
  };

  // A running raid refreshes every 5 seconds, everything else every 30.
  const live = data?.raids.raid?.state === "running";
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(false), live ? 5_000 : 30_000);
    return () => clearInterval(timer);
  }, [load, live]);

  // Manual and changelog are readable without logging in.
  if (loggedOut && (view === "manual" || view === "changelog")) {
    return (
      <main>
        <button type="button" className="small ghost back" onClick={() => setView("character")}>← Log in</button>
        <Doc name={view} onOpen={setView} />
      </main>
    );
  }
  if (loggedOut) return <><TabTitle status={null} /><Login onDone={() => void load()} onOpen={setView} /></>;
  if (!data) return <main className="loading">Loading…</main>;

  const c = data.character;
  const showProfile = (name: string) => {
    if (view !== "profile") setProfileFrom(view);
    setProfileName(name);
    setView("profile");
    window.scrollTo(0, 0);
  };
  return (
    <main>
      <header className="panel hero" data-tour="hero">
        <img src="/icon.svg" alt="" width={64} height={64} className="icon" />
        <div className="hero-text">
          <h1>{c.name}</h1>
          <dl className="stats hero-stats">
            {[
              { icon: "star", label: "Level", value: c.level },
              { icon: "power", label: "Power", value: c.power, title: "Combat power from level, equipment, talents and guild buffs" },
              { icon: "gold", label: "Gold", value: c.gold },
              ...STAT_KEYS.map((k) => ({ icon: k, label: STAT_NAMES[k], value: statValue(c, k) })),
            ].map(({ icon, label, value, title }: { icon: string; label: string; value: string | number; title?: string }) => (
              <div key={label} title={title}>
                <dt><img className="icon" src={`/ui/${icon}.svg`} alt="" width={16} height={16} />{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <Bar filled={Math.floor((c.xpIntoLevel / c.xpForNext) * 10)} total={10} label={`${c.xpIntoLevel} of ${c.xpForNext} XP`} />
          <p className="dim">XP {c.xpIntoLevel}/{c.xpForNext}</p>
        </div>
        <div className="hero-actions">
          <button type="button" className={`inbox-button ${c.unread ? "" : "ghost"}`} popoverTarget="inbox-popover">
            <UiIcon name="mail" />Inbox
            <span className={`badge ${c.unread ? "" : "read"}`} title={`${c.inbox} messages, ${c.unread} unread`}>{c.inbox}</span>
          </button>
          {/* Mounted only while open: loading the inbox marks it read. */}
          <div id="inbox-popover" popover="auto" onToggle={(e) => setInboxOpen((e.nativeEvent as ToggleEvent).newState === "open")}>
            {inboxOpen && <InboxView onChange={reload} />}
          </div>
          <div className="hero-tools">
            <button
              type="button"
              className="small ghost"
              aria-pressed={!muted}
              title="Short sounds when a quest is ready, a monster shows up or a dungeon or raid starts and ends"
              onClick={() => {
                setMuted(!muted);
                setMutedState(!muted);
                if (muted) play("questReady");
              }}
            >
              <UiIcon name={muted ? "soundOff" : "soundOn"} />{muted ? "Sound off" : "Sound on"}
            </button>
            <button type="button" className="small ghost" onClick={() => showProfile(c.name)}><UiIcon name="star" />Profile</button>
            <button type="button" className="small ghost" onClick={() => setTouring(true)}><UiIcon name="help" />Tour</button>
            <button type="button" className="small ghost" data-tour="devices" onClick={() => setPairing(true)}><UiIcon name="terminal" />Devices</button>
            <button type="button" className="small ghost" onClick={() => api("/auth/logout", {}).then(() => setLoggedOut(true))}><UiIcon name="logout" />Log out</button>
          </div>
        </div>
      </header>
      {pairing && <DevicePair onClose={() => setPairing(false)} onOpen={setView} />}
      <BetaNote onOpen={setView} />
      <nav className="tabs" aria-label="Sections">
        {(["character", "talents", "shop", "market", "stats", "ranks", "manual", "changelog"] as const).map((v) => (
          <button key={v} type="button" className={`small ${view === v ? "" : "ghost"}`} aria-current={view === v ? "page" : undefined} data-tour={`nav-${v}`} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </nav>
      {view === "character" && (
        <>
          <QuestStatus status={data.status} onChange={() => void load()} />
          <Inventory items={data.items} shards={data.shards} autoScrap={data.autoScrap} onChange={() => void load()} />
          {data.raids.raid && <RaidView raid={data.raids.raid} power={data.raids.power} me={c.name} onChange={() => void load()} />}
          <GuildHall guild={data.guild} raids={data.raids} me={c.name} onChange={() => void load()} />
          <History quests={data.history} />
        </>
      )}
      {view === "talents" && <TalentsView onChange={() => void load()} />}
      {view === "shop" && <ShopView onChange={() => void load()} />}
      {view === "market" && <MarketView onChange={() => void load()} />}
      {view === "stats" && <StatsView />}
      {view === "ranks" && <RanksView onProfile={showProfile} />}
      {view === "profile" && <ProfileView name={profileName} onBack={() => setView(profileFrom)} />}
      {(view === "manual" || view === "changelog") && <Doc name={view} onOpen={setView} />}
      {view === "ideas" && <Ideas />}
      <footer className="footer">
        <button type="button" className="link" onClick={() => { setView("ideas"); window.scrollTo(0, 0); }}>Ideas &amp; voting</button>
      </footer>
      {touring && <Tour name={c.name} onView={setView} onEnd={endTour} />}
      <TabTitle status={data.status} />
    </main>
  );
}
