import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  type Achievement,
  type Character,
  type Guild,
  type Item,
  type Leaderboard,
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
        <p className="dim">Run <code>quest pair</code> in your terminal and enter the code it shows.</p>
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

/** Pair code for logging in the terminal, for players who started on the website. */
function TerminalPair({ onClose, onOpen }: { onClose: () => void; onOpen: (doc: DocName) => void }) {
  const [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => void api<{ code: string; expiresAt: string }>("/auth/pair", {}).then(setPair, (err: Error) => setError(err.message)), []);
  return (
    <section className="panel install" aria-label="Connect your terminal">
      <div className="row">
        <h2>Connect your terminal</h2>
        <button type="button" className="small ghost" onClick={onClose}>Close</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <ol>
        <li>Install <a href="https://nodejs.org">Node.js</a> 24 or newer, then <code>{INSTALL}</code></li>
        <li>{pair ? <>Run <code>quest login --pair {pair.code}</code> within {minutesUntil(pair.expiresAt)} minutes</> : "Creating a pair code…"}</li>
        <li>Run <code>quest</code> for a quest. The <button type="button" className="link" onClick={() => onOpen("manual")}>manual</button> shows the Claude Code plugin and shell prompt.</li>
      </ol>
      {pair && (
        <p className="dim">
          Another browser or your phone? Open this website there and enter <code>{pair.code}</code> under Already playing. Each code works once.
        </p>
      )}
    </section>
  );
}

function QuestStatus({ status, onChange }: { status: Status; onChange: () => void }) {
  const q = status.quest;
  const e = status.encounter;
  const [message, setMessage] = useState("");
  const ready = !q || (q.resolved && !minutesUntil(status.readyAt));

  async function act(path: string, describe: (data: never) => string) {
    try {
      setMessage(describe(await api<never>(path, {})));
    } catch (err) {
      setMessage((err as Error).message);
    }
    onChange();
  }
  const questResult = (r: Quest & { readyAt: string }) =>
    `${r.name}: ${r.success ? `✓ success · +${r.xp} XP · +${r.gold} gold${r.loot ? ` · found ${r.loot.name}` : ""}` : `✗ failed · +${r.xp} XP`}`;
  const fightResult = (f: { won: boolean; story: string; xp: number; gold: number; loot: Item | null }) =>
    `${f.won ? `Victory · +${f.xp} XP · +${f.gold} gold${f.loot ? ` · found ${f.loot.name}` : ""}` : "Defeated. It got away, nothing lost."} ${f.story}`;

  return (
    <section className="panel" data-tour="status">
      <h2><UiIcon name="hourglass" />Status</h2>
      {e && (
        <div className="row">
          <p className="alert">⚠ {e.name} (Lv {e.level}) appeared · {Math.round(e.winChance * 100)}% odds · <Power yours={e.power} recommended={e.recommended} /> · leaves in {minutesUntil(e.expiresAt)}m</p>
          <button type="button" className="small" onClick={() => act("/fight", fightResult)}>Fight</button>
        </div>
      )}
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
      {q && !q.resolved && (
        <>
          <p>⚔ Quest running · {minutesUntil(q.endsAt) ? `${minutesUntil(q.endsAt)}m left` : "rolling the dice"}</p>
          <Bar filled={questProgress(q)} total={9} label="Quest progress" />
        </>
      )}
      {q?.resolved && (
        <p>
          Last quest: {q.name} · {q.success ? `✓ success · +${q.xp} XP · +${q.gold} gold` : `✗ failed · +${q.xp} XP`}
          {q.loot && <> · found <span className={q.loot.rarity}><RarityIcon rarity={q.loot.rarity} />{q.loot.name}</span></>}
          {minutesUntil(status.readyAt) ? ` · next quest in ${minutesUntil(status.readyAt)}m` : ""}
        </p>
      )}
      {q?.story && <p className="dim">{q.story}</p>}
      {ready && (
        <div className="row">
          <p>{q ? "Ready for a new quest." : "No quest yet."} The result comes at once, then 45 minutes rest.</p>
          <button type="button" data-tour="quest" onClick={() => act("/quests", questResult)}>Start quest</button>
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

function Inventory({ items, onChange }: { items: Item[]; onChange: () => void }) {
  const [error, setError] = useState("");
  const act = (item: Item, action: "equip" | "unequip") =>
    api(`/inventory/${item.id}/${action}`, {}).then(onChange, (err: Error) => setError(err.message));
  const bySlot = new Map(items.filter((i) => i.equippedSlot).map((i) => [i.equippedSlot, i]));
  const bag = items.filter((i) => !i.equippedSlot);
  return (
    <>
      <section className="panel" data-tour="equipment">
        <h2><UiIcon name="equipment" />Equipment</h2>
        {error && <p className="error" role="alert">{error}</p>}
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
                {item ? (
                  <button type="button" className="slot-item" onClick={() => act(item, "unequip")} title={`${item.name}, click to take off`}>
                    <ItemIcon item={item} />
                  </button>
                ) : <span className="slot-empty" />}
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <h2><UiIcon name="bag" />Bag · {bag.length}</h2>
        {bag.length === 0 && <p className="dim">Empty. Successful quests and won fights drop items.</p>}
        <ul className="items">
          {bag.map((item) => (
            <li key={item.id} className={item.rarity}>
              <ItemIcon item={item} />
              <div className="item-text">
                <span className="name">{item.name}</span>
                <span className="dim"><Rarity rarity={item.rarity} /> · {statParts(item.stats).join(" · ")}{item.listed ? " · on market" : ""}</span>
              </div>
              {!item.listed && <button type="button" className="small" onClick={() => act(item, "equip")}>Equip</button>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function History({ quests }: { quests: Quest[] }) {
  return (
    <section className="panel">
      <h2><UiIcon name="scroll" />Quest history</h2>
      {quests.length === 0 ? <p className="dim">No finished quests yet.</p> : (
        <div className="scroll">
          <table>
            <thead><tr><th>Started</th><th>Result</th><th>XP</th><th>Gold</th><th>Loot</th></tr></thead>
            <tbody>
              {quests.map((q) => (
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
          <h3 className="sub">Raid bosses · {leader ? "schedule with quest raid schedule <minutes> <boss>" : "the leader schedules raids"}</h3>
          <ul className="buffs">
            {raids.bosses.map((b) => (
              <li key={b.tier} className={b.unlocked ? "" : "locked"}>
                <span><strong>{b.tier + 1}. {b.name}</strong><br /><em className="dim">{b.flavor}</em></span>
                {b.unlocked ? <Power yours={raids.power} recommended={b.recommended} warn={0.9} /> : <span className="dim">beat the boss before · ⚔ {b.recommended}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function RaidView({ raid, power }: { raid: Raid; power: number }) {
  const label = {
    scheduled: `starts in ${minutesUntil(raid.startsAt)}m · needs ${raid.minPlayers} raiders · join with quest raid join`,
    running: `tick ${raid.tick}/${raid.ticks} · ends in ${minutesUntil(raid.endsAt)}m · stay present to deal damage`,
    won: "defeated · loot for every raider",
    failed: "the boss survived",
    cancelled: `cancelled, fewer than ${raid.minPlayers} raiders`,
  }[raid.state];
  const top = Math.max(1, ...raid.members.map((m) => m.damage));
  return (
    <section className={`panel raid ${raid.state}`}>
      <h2><UiIcon name="raid" />Raid · {raid.boss}</h2>
      <p>{label} · <Power yours={power} recommended={raid.recommended} warn={0.9} /></p>
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
            <span className="dim">{statParts(o.stats).join(" · ")}</span>
            <button type="button" className="small" disabled={o.bought || o.locked || shop.gold < o.price} onClick={() => buy(o.offer)}>
              {o.bought ? "Bought" : o.locked ? `Lv ${o.unlockLevel}` : "Buy"}
            </button>
          </div>
        ))}
      </div>
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
  ["marketBought", "Market draws"], ["shopBought", "Shop purchases"],
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

function RanksView() {
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
                  <td>{r.rank}</td><td>{r.name}</td>{board !== "achievements" && <td>{r.level}</td>}<td>{r.value}</td>
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

type View = "character" | "talents" | "shop" | "stats" | "ranks" | "ideas" | DocName;

type Data = { character: Character; status: Status; items: Item[]; history: Quest[]; guild: Guild | null; raids: Raids };

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);
  const [view, setView] = useState<View>("character");
  const [touring, setTouring] = useState(false);
  const [pairing, setPairing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [character, status, inventory, history, guild, raid] = await Promise.all([
        api<Character>("/character"),
        api<Status>("/quests/current"),
        api<{ items: Item[] }>("/inventory"),
        api<Quest[]>("/quests/history"),
        api<{ guild: Guild | null }>("/guild"),
        api<Raids>("/raids/current"),
      ]);
      setData({ character, status, items: inventory.items, history, guild: guild.guild, raids: raid });
      setLoggedOut(false);
    } catch (err) {
      if (err instanceof Unauthorized) setLoggedOut(true);
    }
  }, []);

  // An open tab counts as a heartbeat once a minute, so monsters can show up here too.
  useEffect(() => {
    if (loggedOut) return;
    const beat = () => void api("/heartbeat", {}).catch(() => {});
    beat();
    const timer = setInterval(beat, 60_000);
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
    const timer = setInterval(() => void load(), live ? 5_000 : 30_000);
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
  if (loggedOut) return <Login onDone={() => void load()} onOpen={setView} />;
  if (!data) return <main className="loading">Loading…</main>;

  const c = data.character;
  return (
    <main>
      <header className="panel hero" data-tour="hero">
        <img src="/icon.svg" alt="" width={64} height={64} className="icon" />
        <div className="hero-text">
          <h1>{c.name}</h1>
          <p>Lv {c.level} · <span className="power" title="Combat power from level, equipment, talents and guild buffs">⚔ {c.power}</span> · <Gold amount={c.gold} /> · {statParts(c).join(" · ") || "no equipment yet"}</p>
          <Bar filled={Math.floor((c.xpIntoLevel / c.xpForNext) * 10)} total={10} label={`${c.xpIntoLevel} of ${c.xpForNext} XP`} />
          <p className="dim">XP {c.xpIntoLevel}/{c.xpForNext}</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="small ghost" onClick={() => setTouring(true)}>Tour</button>
          <button type="button" className="small ghost" data-tour="terminal" onClick={() => setPairing(true)}>Terminal</button>
          <button type="button" className="small ghost" onClick={() => api("/auth/logout", {}).then(() => setLoggedOut(true))}>Log out</button>
        </div>
      </header>
      {pairing && <TerminalPair onClose={() => setPairing(false)} onOpen={setView} />}
      <BetaNote onOpen={setView} />
      <nav className="tabs" aria-label="Sections">
        {(["character", "talents", "shop", "stats", "ranks", "manual", "changelog"] as const).map((v) => (
          <button key={v} type="button" className={`small ${view === v ? "" : "ghost"}`} aria-current={view === v ? "page" : undefined} data-tour={`nav-${v}`} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </nav>
      {view === "character" && (
        <>
          <QuestStatus status={data.status} onChange={() => void load()} />
          <Inventory items={data.items} onChange={() => void load()} />
          {data.raids.raid && <RaidView raid={data.raids.raid} power={data.raids.power} />}
          <GuildHall guild={data.guild} raids={data.raids} me={c.name} onChange={() => void load()} />
          <History quests={data.history} />
        </>
      )}
      {view === "talents" && <TalentsView onChange={() => void load()} />}
      {view === "shop" && <ShopView onChange={() => void load()} />}
      {view === "stats" && <StatsView />}
      {view === "ranks" && <RanksView />}
      {(view === "manual" || view === "changelog") && <Doc name={view} onOpen={setView} />}
      {view === "ideas" && <Ideas />}
      <footer className="footer">
        <button type="button" className="link" onClick={() => { setView("ideas"); window.scrollTo(0, 0); }}>Ideas &amp; voting</button>
      </footer>
      {touring && <Tour name={c.name} onView={setView} onEnd={endTour} />}
    </main>
  );
}
