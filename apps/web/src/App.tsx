import { type FormEvent, useCallback, useEffect, useState } from "react";
import { type Character, type Guild, type Item, type Quest, type Raid, type Stats, type Status, Unauthorized, api } from "./api.ts";

const SLOTS = [
  ["head", "Head"], ["chest", "Chest"], ["legs", "Legs"], ["hands", "Hands"], ["feet", "Feet"], ["mainHand", "Main hand"],
  ["offHand", "Off hand"], ["ring1", "Ring"], ["ring2", "Ring"], ["neck", "Neck"], ["ears", "Ears"],
] as const;

const minutesUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));

function statParts(s: Stats) {
  return [
    s.attack ? `ATK ${s.attack}` : null,
    s.defense ? `DEF ${s.defense}` : null,
    s.luck ? `LCK +${s.luck}` : null,
    s.fortune ? `FOR +${s.fortune}%` : null,
  ].filter(Boolean) as string[];
}

function Bar({ filled, total, label }: { filled: number; total: number; label: string }) {
  return (
    <div className="bar" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={i < filled ? "on" : ""} />)}
    </div>
  );
}

function ItemIcon({ item }: { item: Item }) {
  return <img className="icon" src={`/items/${item.key}.svg`} alt="" width={48} height={48} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/auth/web", { code });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <main className="login">
      <img src="/icon.svg" alt="" width={96} height={96} className="icon" />
      <h1>Tokenquest</h1>
      <form className="panel" onSubmit={submit}>
        <label htmlFor="code">Pair code</label>
        <p className="dim">Run <code>quest pair</code> in your terminal and enter the code it shows.</p>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" autoComplete="off" autoFocus />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit">Log in</button>
      </form>
    </main>
  );
}

function QuestStatus({ status }: { status: Status }) {
  const q = status.quest;
  const e = status.encounter;
  return (
    <section className="panel">
      <h2>Status</h2>
      {e && (
        <p className="alert">
          ⚠ {e.name} (Lv {e.level}) appeared · {Math.round(e.winChance * 100)}% odds · <code>quest fight</code> within {minutesUntil(e.expiresAt)}m
        </p>
      )}
      {status.dungeon?.state === "lobby" && (
        <p>Dungeon <code>{status.dungeon.code}</code> starts in {minutesUntil(status.dungeon.startsAt)}m · party: {status.dungeon.members.join(", ")}</p>
      )}
      {status.dungeon?.state === "running" && (
        <p>Dungeon stage {status.dungeon.cleared + 1}/4 · {status.dungeon.current} · {minutesUntil(status.dungeon.stageEndsAt ?? "")}m left</p>
      )}
      {!q && <p>No quest yet. Start one with <code>quest</code>.</p>}
      {q && !q.resolved && (
        <>
          <p>⚔ Quest running · {minutesUntil(q.endsAt) || "rolling the dice"}{minutesUntil(q.endsAt) ? "m left" : ""}</p>
          <Bar filled={q.presentSlots} total={q.totalSlots} label={`${q.presentSlots} of ${q.totalSlots} slots present`} />
        </>
      )}
      {q?.resolved && (
        <p>
          Last quest: {q.success ? `✓ success · +${q.xp} XP · +${q.gold} gold` : `✗ failed · +${q.xp} XP`}
          {q.loot && <> · found <span className={q.loot.rarity}>{q.loot.name}</span></>}
          {" · "}
          {minutesUntil(status.readyAt) ? `next quest in ${minutesUntil(status.readyAt)}m` : "ready for a new quest"}
        </p>
      )}
    </section>
  );
}

function Inventory({ items, onChange }: { items: Item[]; onChange: () => void }) {
  const [error, setError] = useState("");
  const act = (item: Item, action: "equip" | "unequip") =>
    api(`/inventory/${item.id}/${action}`, {}).then(onChange, (err: Error) => setError(err.message));
  const bySlot = new Map(items.filter((i) => i.equippedSlot).map((i) => [i.equippedSlot, i]));
  const bag = items.filter((i) => !i.equippedSlot);
  return (
    <>
      <section className="panel">
        <h2>Equipment</h2>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="slots">
          {SLOTS.map(([slot, label]) => {
            const item = bySlot.get(slot);
            const twoHander = slot === "offHand" && bySlot.get("mainHand")?.type === "twoHanded" ? bySlot.get("mainHand") : undefined;
            if (twoHander) {
              return (
                <div key={slot} className={`slot blocked ${twoHander.rarity}`} title="Blocked by a two-handed weapon">
                  <span className="slot-label">2-hand</span>
                  <ItemIcon item={twoHander} />
                </div>
              );
            }
            return (
              <div key={slot} className={`slot ${item?.rarity ?? "empty"}`}>
                <span className="slot-label">{label}</span>
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
        <h2>Bag · {bag.length}</h2>
        {bag.length === 0 && <p className="dim">Empty. Successful quests and won fights drop items.</p>}
        <ul className="items">
          {bag.map((item) => (
            <li key={item.id} className={item.rarity}>
              <ItemIcon item={item} />
              <div className="item-text">
                <span className="name">{item.name}</span>
                <span className="dim">{item.rarity} · {statParts(item.stats).join(" · ")}{item.listed ? " · on market" : ""}</span>
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
      <h2>Quest history</h2>
      {quests.length === 0 ? <p className="dim">No finished quests yet.</p> : (
        <div className="scroll">
          <table>
            <thead><tr><th>Started</th><th>Result</th><th>Presence</th><th>XP</th><th>Gold</th><th>Loot</th></tr></thead>
            <tbody>
              {quests.map((q) => (
                <tr key={q.startedAt}>
                  <td>{new Date(q.startedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{q.success ? "✓" : "✗"}</td>
                  <td>{q.presentSlots}/{q.totalSlots}</td>
                  <td>{q.xp}</td>
                  <td>{q.gold}</td>
                  <td>{q.loot ? <span className={q.loot.rarity}>{q.loot.name}</span> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GuildHall({ guild }: { guild: Guild | null }) {
  return (
    <section className="panel">
      <h2>Guild hall</h2>
      {!guild ? (
        <p className="dim">No guild yet. Found one with <code>quest guild create &lt;name&gt;</code> or join with <code>quest guild join &lt;code&gt;</code>.</p>
      ) : (
        <>
          <p>{guild.name} · Lv {guild.level} · {guild.members.length} members · join code <code>{guild.code}</code></p>
          <Bar filled={Math.floor((guild.xpIntoLevel / guild.xpForNext) * 10)} total={10} label={`${guild.xpIntoLevel} of ${guild.xpForNext} guild XP`} />
          <ul className="members">
            {guild.members.map((m) => (
              <li key={m.name}><span>{m.role === "leader" ? "♛ " : ""}{m.name}</span><span className="dim">Lv {m.level}</span></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function RaidView({ raid }: { raid: Raid }) {
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
      <h2>Raid · {raid.boss}</h2>
      <p>{label}</p>
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

type Data = { character: Character; status: Status; items: Item[]; history: Quest[]; guild: Guild | null; raid: Raid | null };

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);

  const load = useCallback(async () => {
    try {
      const [character, status, inventory, history, guild, raid] = await Promise.all([
        api<Character>("/character"),
        api<Status>("/quests/current"),
        api<{ items: Item[] }>("/inventory"),
        api<Quest[]>("/quests/history"),
        api<{ guild: Guild | null }>("/guild"),
        api<{ raid: Raid | null }>("/raids/current"),
      ]);
      setData({ character, status, items: inventory.items, history, guild: guild.guild, raid: raid.raid });
      setLoggedOut(false);
    } catch (err) {
      if (err instanceof Unauthorized) setLoggedOut(true);
    }
  }, []);

  // A running raid refreshes every 5 seconds, everything else every 30.
  const live = data?.raid?.state === "running";
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), live ? 5_000 : 30_000);
    return () => clearInterval(timer);
  }, [load, live]);

  if (loggedOut) return <Login onDone={() => void load()} />;
  if (!data) return <main className="loading">Loading…</main>;

  const c = data.character;
  return (
    <main>
      <header className="panel hero">
        <img src="/icon.svg" alt="" width={64} height={64} className="icon" />
        <div className="hero-text">
          <h1>{c.name}</h1>
          <p>Lv {c.level} · {c.gold} gold · {statParts(c).join(" · ") || "no equipment yet"}</p>
          <Bar filled={Math.floor((c.xpIntoLevel / c.xpForNext) * 10)} total={10} label={`${c.xpIntoLevel} of ${c.xpForNext} XP`} />
          <p className="dim">XP {c.xpIntoLevel}/{c.xpForNext}</p>
        </div>
        <button type="button" className="small ghost" onClick={() => api("/auth/logout", {}).then(() => setLoggedOut(true))}>Log out</button>
      </header>
      <QuestStatus status={data.status} />
      <Inventory items={data.items} onChange={() => void load()} />
      {data.raid && <RaidView raid={data.raid} />}
      <GuildHall guild={data.guild} />
      <History quests={data.history} />
    </main>
  );
}
