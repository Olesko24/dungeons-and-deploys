# Dungeons & Deploys manual

> **Beta.** Dungeons & Deploys is in beta. Rules, numbers and even basic mechanics can still change, and progress may be reset.
> Changes are listed in the [changelog](../CHANGELOG.md).

Dungeons & Deploys is an idle RPG that runs next to your work. Start a quest, come back later, collect loot.
Rewards depend on time, gear and dice, never on how much or how well you work. You never have to keep a terminal open.

## Contents

1. [Getting started](#getting-started)
2. [Heartbeats](#heartbeats)
3. [Quests](#quests)
4. [Character and levels](#character-and-levels)
5. [Items](#items)
6. [Random encounters](#random-encounters)
7. [Shop](#shop)
8. [Market](#market)
9. [Inbox](#inbox)
10. [Dungeons](#dungeons)
11. [Guilds](#guilds)
12. [Raids](#raids)
13. [Achievements, statistics and leaderboards](#achievements-statistics-and-leaderboards)
14. [Website](#website)
15. [Account and devices](#account-and-devices)
16. [What is sent to the server](#what-is-sent-to-the-server)
17. [Command reference](#command-reference)

## Getting started

You need an access code from someone who runs the game. Start in the terminal or on the website, both reach the
same character.

**Website:** enter the access code and a character name under **New here? Start playing**. To add the terminal
later, click **Terminal** at the top: it shows the install command and a pair code.

**Terminal:** you need Node.js 24 or newer.

```sh
npm install -g dungeons-and-deploys
quest login --code <ACCESS_CODE>    # pick a character name, 2-20 letters, digits, _ or -
quest                               # start your first quest
```

That is all you need. Optionally connect Claude Code or your shell: they show your status and let monsters appear while you work.

**Claude Code:**

```
/plugin marketplace add Olesko24/dungeons-and-deploys
/plugin install dungeons-and-deploys@dungeons-and-deploys
```

Your prompts send heartbeats. To see your status in Claude Code, add this to `~/.claude/settings.json`:

```json
{ "statusLine": { "type": "command", "command": "cat ~/.dungeons-and-deploys/status.txt 2>/dev/null" } }
```

In Claude Code, run game commands with the `!` prefix, for example `! quest status`. They run in your shell and cost no tokens.

**Shell (zsh or bash):** add this to `~/.zshrc` or `~/.bashrc`:

```sh
eval "$(quest init zsh)"     # or: quest init bash
```

Your commands send heartbeats. For the status in your prompt, add `$(dnd_prompt)` to it, for example in zsh:

```sh
setopt prompt_subst
RPROMPT='$(dnd_prompt)'
```

## Heartbeats

Heartbeats are optional. Quests, dungeons and raids work without them.

A heartbeat comes from Claude Code (your prompts), the shell integration (your commands) or an open website tab (once a minute). Each source sends at most one per minute, in the background. Heartbeats refresh your status line and can spawn [random monsters](#random-encounters).

## Quests

Start a quest with `quest` or the **Start quest** button on the website. The dice decide at once and you see the quest, its rewards and any loot right away:

- 75% success chance, plus your **Luck**, at most 95%
- Success: 70 XP and 14–19 gold. **Fortune** adds percent to that gold
- Failure: 10 XP
- A successful quest has a 40% chance to drop an item, with two rarity rolls (the better one counts). After three
  successful quests without loot, the next successful quest always drops one.

After a quest there is a 45-minute rest before the next one.

```sh
quest status            # last result and when the next quest is ready
quest status --short    # the one-line status used by status lines, no network
```

## Character and levels

`quest char` shows your character. XP needed for the next level is 100 × level^1.5:

| Level | Total XP | Roughly |
|---|---|---|
| 5 | ~1,700 | 30 quests |
| 10 | ~11,000 | 200 quests |
| 20 | ~67,000 | 1,200 quests |

Higher levels mainly mean better loot (see below) and talent points. The level cap is 100.

### Combat power

Your **combat power** (⚔) sums up how strong you are in fights, dungeons and raids. It grows with your level,
attack and defense, and talents and guild buffs add percent on top:

```
power = (4 + level + attack) × (1 + (level + defense) / 20) × 10
```

`quest char` and the website header show it. Monsters and dungeon stages show a **recommended** power: with it
your chance is about 60% before luck. Green means you reach it, yellow at least 75% of it, red below. Monsters
grow with your level, so only gear, talents and buffs move you past the recommendation.

### Talents

Every level gives one talent point, 100 at the cap. Four trees hold 36 ranks each, so you cannot max everything.
A row opens after 5 more points in its tree (shown in brackets). Some talents need the talent right above them maxed.
On the website every talent is a tile: click it for the details and to learn a rank.

| Tree | Row (points) | Talent | Effect | Ranks | Needs maxed |
|---|---|---|---|---|---|
| Offense | 1 (0) | Sharp Syntax | +1% combat power per rank | 5 | |
| Offense | 1 (0) | Quick Fix | +2% combat power in monster fights per rank | 5 | |
| Offense | 2 (5) | Hot Path | +2% raid damage per rank | 5 | |
| Offense | 2 (5) | Bounty Hunter | +5% gold from monster fights per rank | 5 | |
| Offense | 3 (10) | Overclock | +2% combat power per rank | 5 | Hot Path |
| Offense | 3 (10) | Boss Slayer | +3% combat power against dungeon bosses per rank | 5 | |
| Offense | 4 (15) | Hotfix Frenzy | +4% XP from monster fights per rank | 5 | |
| Offense | 5 (20) | Ten-x Developer | +10% combat power per rank | 1 | Hotfix Frenzy |
| Defense | 1 (0) | Type Safety | +1% combat power in dungeons and raids per rank | 5 | |
| Defense | 1 (0) | Graceful Degradation | +3 XP for failed quests and lost fights per rank | 5 | |
| Defense | 2 (5) | Retry Policy | +1% chance on every dungeon stage per rank | 5 | |
| Defense | 2 (5) | Circuit Breaker | +2% combat power in monster fights per rank | 5 | |
| Defense | 3 (10) | Load Balancer | +2% combat power in dungeons and raids per rank | 5 | Retry Policy |
| Defense | 3 (10) | Disaster Recovery | +4% XP and gold from raids per rank | 5 | |
| Defense | 4 (15) | Redundancy | +2% chance on every dungeon stage per rank | 5 | |
| Defense | 5 (20) | Zero Downtime | +10% combat power in dungeons and raids per rank | 1 | Redundancy |
| Luck | 1 (0) | Lucky Guess | +1% quest and fight success per rank | 5 | |
| Luck | 1 (0) | Scavenger | +1% loot drop chance on quests and fights per rank | 5 | |
| Luck | 2 (5) | Golden Ticket | +2% chance for an extra rarity roll on loot per rank | 5 | |
| Luck | 2 (5) | Bug Magnet | +10% more monster encounters per rank | 5 | |
| Luck | 3 (10) | Lucky Commit | +4% chance for an extra rarity roll on loot per rank | 5 | Golden Ticket |
| Luck | 3 (10) | Rubber Duck | +2% quest success per rank | 5 | |
| Luck | 4 (15) | Heisenbug Whisperer | +1% quest and fight success per rank | 5 | |
| Luck | 5 (20) | Cosmic Ray | +15% chance for an extra rarity roll on loot per rank | 1 | Heisenbug Whisperer |
| General | 1 (0) | Fast Learner | +2% XP per rank | 5 | |
| General | 1 (0) | Haggler | +2% gold per rank | 5 | |
| General | 2 (5) | Stack Overflow | +5% XP from quests per rank | 5 | |
| General | 2 (5) | Expense Report | +5% gold from quests per rank | 5 | |
| General | 3 (10) | Pair Programming | +5% XP and gold from dungeon stages per rank | 5 | Stack Overflow |
| General | 3 (10) | Coffee Break | 3% shorter rest after a quest per rank | 5 | |
| General | 4 (15) | Mentor | +3% XP per rank | 5 | |
| General | 5 (20) | Principal Engineer | +10% XP per rank | 1 | Mentor |

Combat power in raids makes you hit harder, it does not make the boss tougher. A reset returns all points and
costs 10 gold per spent point.

```sh
quest talents                 # trees, ranks and free points
quest talents learn <key>     # one rank, e.g. quest talents learn sharpSyntax
quest talents reset           # all points back, 10 gold each
```

## Items

### Slots

| Area | Slots | Primary stat |
|---|---|---|
| Armor | head, chest, legs, hands, feet | Defense |
| Weapons | main hand + shield, or a two-handed weapon in both | Attack (shield: Defense) |
| Jewelry | 2 rings, necklace, earrings | Rings: Luck, necklace and earrings: Fortune |

### Stats

| Stat | Effect |
|---|---|
| **ATK** Attack | Fights, dungeons and raids |
| **DEF** Defense | Fights, dungeons and raids, with diminishing returns |
| **LCK** Luck | Percentage points on quest and fight success, capped at 95% |
| **FOR** Fortune | Percent more gold from quests and fights |

### Rarities and rolled stats

Every item rolls its stats when it drops, so two items of the same name are rarely equal.

There are ten rarities. Each one rolls higher stats than the one below.

| Rarity | Attack or defense | Bonus stats | Drops from level |
|---|---|---|---|
| Common | 1–3 | none | 1 |
| Uncommon | 2–4 | 1 | 1 |
| Rare | 3–6 | 1 | 5 |
| Epic | 6–10 | 2 | 10 |
| Legendary | 10–15 | 3 | 20 |
| Mythic | 15–22 | 3 | 30 |
| Ancient | 22–32 | 3 | 45 |
| Divine | 32–45 | 3 | 60 |
| Celestial | 45–62 | 3 | 75 |
| Eternal | 62–85 | 3 | 90 |

Luck and fortune grow more slowly, since luck is capped at 95% anyway. On the website every rarity has its own color and symbol.

Bonus stats are always different from the primary stat. The strongest bonus gives the item a name prefix: **Slaughterer's** (attack), **Defender's** (defense), **Gambler's** (luck) or **Merchant's** (fortune).

### Weapons

Twelve weapon kinds drop in every rarity. They differ in attack and in a **signature stat** they always roll, even as common.

| Kind | Hands | Attack | Signature |
|---|---|---|---|
| Dagger | 1 | ×0.75 | Luck |
| Sword | 1 | ×1.0 | – |
| Axe | 1 | ×1.25 | – |
| Mace | 1 | ×0.9 | Defense |
| Morning Star | 1 | ×1.1 | Fortune |
| Greatsword | 2 | ×1.0 | – |
| Battle Axe | 2 | ×1.25 | – |
| Scythe | 2 | ×1.1 | Luck |
| Spear | 2 | ×0.9 | Defense |
| Staff | 2 | ×0.7 | Fortune |
| Bow | 2 | ×0.85 | Luck |
| Crossbow | 2 | ×0.95 | Defense |

Two-handed weapons roll double attack but keep the shield slot empty.

### Loot and level

Drops roll the slot type evenly, then the rarity by your level:

| Level | Com. | Unc. | Rare | Epic | Leg. | Myth. | Anc. | Div. | Cel. | Eter. |
|---|---|---|---|---|---|---|---|---|---|---|
| 1–4 | 85% | 15% | – | – | – | – | – | – | – | – |
| 5–9 | 70% | 25% | 5% | – | – | – | – | – | – | – |
| 10–19 | 55% | 28% | 15% | 2% | – | – | – | – | – | – |
| 20–29 | 38% | 30% | 22% | 9% | 1% | – | – | – | – | – |
| 30–44 | 26% | 27% | 25% | 15% | 6% | 1% | – | – | – | – |
| 45–59 | 17% | 22% | 25% | 20% | 11% | 4% | 1% | – | – | – |
| 60–74 | 12% | 18% | 23% | 22% | 15% | 7% | 2.5% | 0.5% | – | – |
| 75–89 | 8% | 14% | 21% | 23% | 18% | 10% | 4% | 1.5% | 0.5% | – |
| 90+ | 5% | 10% | 18% | 23% | 20% | 13% | 6% | 3% | 1.5% | 0.5% |

Quest loot rolls the rarity twice and keeps the better result. Dungeon and raid bosses roll more often.

There is no minimum level to equip anything.

### Bag limit and scrapping

You can own **50 items**, equipped and listed ones included. Scrap items you do not need: an item is gone for good and pays a quarter of its value in gold. With a full bag, new loot from quests, fights, dungeons and raids is scrapped right away and paid out, so nothing is lost, and the shop and market refuse purchases until you make room. A market draw you already joined still delivers its item.

```sh
quest inv                         # equipped items and your bag
quest equip <#id>                 # rings: --slot ring1 or ring2
quest unequip <#id>
quest scrap <#id>                 # destroy a bag item for a quarter of its value
```

### Upgrading and shards

Fuse **3 bag items of the same rarity** into one random item of the next rarity, with freshly rolled stats. Equipped and listed items cannot be fused, eternal items are already the highest rarity. On the website pick three items with **Upgrade** in your bag.

Dungeon and raid bosses have a **30% chance** per player to drop a shard on top of their loot. A shard rolls its rarity like the boss loot. Forge it into a random item of that rarity whenever you have room in your bag. Shards stack and do not count against the bag limit.

```sh
quest upgrade <#id> <#id> <#id>   # 3 items of one rarity → 1 random item of the next
quest forge <rarity>              # shard → random item of its rarity, shards are listed in quest inv
```

## Random encounters

Every heartbeat has a 2% chance to spawn a monster, at most one at a time. Your status line and the website show it. You have 5 minutes to fight, in the terminal or with the **Fight** button:

```sh
quest fight
```

Your win chance compares your combat power with the monster and adds your luck. It is always between 5% and 95%. Without gear an average monster is a coin flip. The status shows your power next to the recommended power for this monster.

| Monster | Toughness |
|---|---|
| Bug Swarm | weakest, most common |
| Memory Leak Slime | |
| Flaky Test Goblin | average |
| Null Pointer Wraith | |
| Race Condition Twins | |
| Legacy Code Golem | |
| Merge Conflict Hydra | |
| Dependency Dragon | strongest, rare |

A win gives XP and gold by toughness and a 40% chance for an item. A defeat costs nothing.

## Shop

The shop has three offers per day, the same for every player: one uncommon, one epic and one mythic item. They change at midnight UTC.

| Offer | Price | Needs |
|---|---|---|
| Uncommon | 70 gold | – |
| Epic | 240 gold | level 10 |
| Mythic | 1000 gold | level 30 |

You can buy each offer once per day. Offers show their stats, and every buyer gets exactly that item.

```sh
quest shop
quest shop buy <1-3>
```

## Market

Players sell items to each other on the market. The seller picks the price, buyers see every listing with its stats.

**Selling.** Pick an item from your bag and set a price. The form suggests the item's value: the base price of its rarity, from 75% for the weakest roll up to 125% for the best one. When the item sells you get the price minus a 10% fee. Listed items cannot be equipped. You can take a listing back as long as nobody is in line for it.

| Rarity | Base price |
|---|---|
| Common | 20 gold |
| Uncommon | 35 gold |
| Rare | 60 gold |
| Epic | 120 gold |
| Legendary | 250 gold |
| Mythic | 500 gold |
| Ancient | 900 gold |
| Divine | 1600 gold |
| Celestial | 2800 gold |
| Eternal | 5000 gold |

**Price tags.** Every listing compares its price with the item's value: **Loot** below 85%, **Fair trade** up to 115%, **Rip-off** above.

**Buying.** A new listing collects buyers for **30 minutes**. Joining the line takes the price from your gold right away, leaving the line before the draw gives it back. When the 30 minutes are over, one buyer is drawn at random and gets the item, everyone else gets their gold back. If nobody joined, the item stays on the market and the first player to buy it gets it at once. Your inbox tells you how a draw went.

Filter the listings by rarity and slot, show only open lines, items to buy at once or your own listings, and sort by age or price.

```sh
quest market                                # every listing
quest market --rarity epic --slot ring      # filters, --show line|buy|mine, --sort price
quest market buy <#id>                      # join the line, or buy at once when there is none
quest market leave <#id>                    # leave a line, your gold comes back
quest market sell <#id> [price]             # without a price it goes up at its value
quest market unlist <#id>
```

## Inbox

The inbox collects what happened to you, also while you were away: market sales and draws, dungeon and raid results with their rewards and level-ups, scheduled raids, guild members joining and leaving, buffs your leader bought and achievements. The website shows the number of new entries on **Inbox** at the top, `quest char` mentions them too.

Delete single entries or clear the whole inbox, deleted entries are gone for good. Entries older than 30 days are deleted automatically.

```sh
quest inbox                 # newest first, ● marks new entries
quest inbox delete <#id>
quest inbox clear
```

## Dungeons

A dungeon is a run for 1–5 players: a 5-minute lobby, then three stages and a boss of 15 minutes each.

```sh
quest dungeon start          # opens a lobby and prints a join code
quest dungeon join <code>    # others join during the lobby
quest dungeon                # progress
```

Each stage succeeds or fails for the whole party. The chance depends on everyone's combat power and a teamwork bonus per member. `quest dungeon` and the website show your power and the recommendation for every stage. Nobody needs to be online during the run. Stages get 10% tougher and pay 10% more per member, so groups are rewarded but solo works too.

Every cleared stage pays XP and gold. A failed stage ends the run, you keep what you earned. Beating the boss gives every member a guaranteed item, with more rarity rolls in bigger parties, and a 30% chance for a shard.

## Guilds

```sh
quest guild create <name>    # you become the leader, the guild gets a join code
quest guild join <code>
quest guild leave
quest guild                  # members, guild level, bank and buffs
quest guild donate <gold>    # gold into the guild bank
quest guild buff <key>       # leader only: activate a buff
```

The guild hall on the website can found, join and leave guilds too. Without a guild it lists every guild with its members and average combat power. Join codes stay private, ask a member for theirs. Joining is limited to 5 tries a minute, so join codes cannot be guessed.

A guild has up to 50 members. Its level grows with a tenth of the members' quest XP and with raid wins. If the leader leaves, the longest-standing member takes over. The last member to leave dissolves the guild.

### Guild bank and buffs

Every successful quest of a member adds 10% of its gold to the guild bank, on top of the member's own reward.
Members can donate more. The leader spends the bank on buffs that work for every member for 24 hours. Several
different buffs can run at once, the same buff once at a time.

| Buff | Effect | Cost | Guild level |
|---|---|---|---|
| Standup Snacks | +10% XP | 300 | 1 |
| Bonus Round | +10% gold | 300 | 1 |
| War Room | +5% combat power | 500 | 3 |
| Shared Cache | +5% loot drop chance | 500 | 5 |
| Async Standup | 15% shorter rest after a quest | 800 | 8 |

## Raids

Raids are the only content that needs a guild.

```sh
quest raid schedule <minutes> [boss]   # leader only, 5 to 1440 minutes ahead, boss 1-10
quest raid join                        # members join until it starts
quest raid                             # the raid, your raid power and the bosses
```

A raid needs at least 5 raiders, otherwise it is cancelled at the start. It lasts 30 minutes in six 5-minute ticks. In every tick, every raider deals damage based on their combat power, and the boss rolls a phase that makes it harder or easier to hit. Nobody needs to be online during the raid.

### Raid bosses

There are ten bosses, each harder than the last. A guild starts with the first and unlocks the next one by
beating the strongest it has unlocked. Without a boss number, the leader schedules the strongest unlocked one.

| Boss | Name | Recommended power | Loot | XP and gold |
|---|---|---|---|---|
| 1 | The Monolith | 250 | 3 rolls, loot level 5+ | ×1 |
| 2 | The Legacy Mainframe | 600 | 4 rolls, loot level 10+ | ×1.5 |
| 3 | The Kubernetes Kraken | 1400 | 5 rolls, loot level 15+ | ×2 |
| 4 | The Infinite Loop | 3000 | 6 rolls, loot level 20+ | ×3 |
| 5 | The Production Outage | 6000 | 7 rolls, loot level 25+ | ×4 |
| 6 | The Big Rewrite | 12000 | 8 rolls, loot level 30+ | ×6 |
| 7 | The Debt Collector | 18000 | 9 rolls, loot level 45+ | ×8 |
| 8 | The Distributed Monolith | 35000 | 10 rolls, loot level 60+ | ×10 |
| 9 | The Halting Problem | 65000 | 11 rolls, loot level 75+ | ×13 |
| 10 | The Final Migration | 120000 | 12 rolls, loot level 90+ | ×16 |

Boss HP depends only on the boss and the number of raiders, so it does not grow with your gear. If the raiders'
average power matches the recommendation, the raid wins about 60% of the time. The odds drop fast below it:
at 90% of the recommendation only about one raid in five wins, so stronger raiders carry weaker ones.

A win gives every raider who dealt damage XP, gold, an item and a 30% chance for a shard. Harder bosses roll the rarity more often and use at
least their loot level, so their average loot is better.

## Achievements, statistics and leaderboards

`quest stats` shows what you have done so far and your achievements. There are 19 achievements, from finishing your first quest to defeating a Dependency Dragon or winning a raid. They give no rewards. Once unlocked, an achievement stays, with its date.

`quest top` shows leaderboards: by level, by combat power, by achievements and by guild level. The power board counts level, gear and talents, not temporary guild buffs. You see the top 20 and your own rank. The guild board lists every guild with its members and their average combat power, so you can compare guilds before joining. There is no gold leaderboard.

## Website

The website shows your character, equipment, bag, quest history, guild, talents, shop, market, inbox, statistics and leaderboards. Everything the terminal can do in the game works there too: start or join a dungeon in the status panel, sell items from your bag and buy them under **market**, schedule a raid in the guild hall (leader) and join it in the raid panel. New players can create their character there with an access code. Players who started in the terminal run `quest pair` and enter the code it shows. **Terminal** at the top does the opposite: it shows a pair code to log in the terminal, or another browser such as your phone.

An open tab plays short sounds when a quest is ready, a monster shows up, or a dungeon or raid starts and ends. Browsers only allow sound after your first click on the page. **Sound on** at the top mutes them, the choice is remembered in that browser.

On your first visit a short tour walks you through the page. It highlights the real buttons and moves on when you click them. You can skip it and restart it any time with **Tour** at the top. Finishing it unlocks the achievement Hello, World.

## Account and devices

Dungeons & Deploys has no email and no password. Your login token on your devices is your account.

- To play on another device, run `quest pair` (or click **Terminal** on the website) on a device that is logged in, then `quest login --pair <code>` on the new one within 10 minutes.
- **If you lose every logged-in device, your character is lost.** Keep it paired on a second device if you care about it.
- The token is stored in `~/.dungeons-and-deploys/config.json`, readable only by you.

## What is sent to the server

- Heartbeats: only that one happened. No prompt, command, file or code content is ever sent.
- Commands you run, like starting a quest or equipping an item.
- Your character name. Nothing else about you.

## Command reference

| Command | What it does |
|---|---|
| `quest` | Do a quest, result at once |
| `quest status [--short]` | Current quest and the last result |
| `quest char` | Character sheet |
| `quest inv` | Inventory |
| `quest equip <#id> [--slot ring1\|ring2]` | Equip an item |
| `quest unequip <#id>` | Take an item off |
| `quest scrap <#id>` | Destroy a bag item for gold |
| `quest upgrade <#id> <#id> <#id>` | Fuse 3 items of one rarity into one of the next |
| `quest forge <rarity>` | Turn a shard into an item |
| `quest fight` | Fight a monster that showed up |
| `quest shop [buy <1-3>]` | Daily shop |
| `quest market [--rarity r] [--slot s] [--show line\|buy\|mine] [--sort price]` | Market listings |
| `quest market buy\|leave <#id>` | Join a line or buy at once, leave a line |
| `quest market sell <#id> [price]` / `quest market unlist <#id>` | Sell from your bag, take it back |
| `quest inbox [delete <#id>\|clear]` | What happened while you were away |
| `quest dungeon [start\|join <code>]` | Dungeons |
| `quest guild [create <name>\|join <code>\|leave]` | Guilds |
| `quest guild donate <gold>` / `quest guild buff <key>` | Guild bank and buffs |
| `quest raid [schedule <minutes> [boss]\|join]` | Raids |
| `quest talents [learn <key>\|reset]` | Talents |
| `quest stats` | Statistics and achievements |
| `quest top [xp\|power\|achievements\|guilds]` | Leaderboards |
| `quest login --code <code>` | New player |
| `quest pair` / `quest login --pair <code>` | Another device or the website |
| `quest init zsh\|bash` | Shell integration |
| `quest heartbeat` | Send a heartbeat, called by the integrations |
| `quest help`, `--help`, `-h` | Command overview |
