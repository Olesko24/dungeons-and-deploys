# Tokenquest manual

> **Beta.** Tokenquest is in beta. Rules, numbers and even basic mechanics can still change, and progress may be reset.
> Changes are listed in the [changelog](../CHANGELOG.md).

Tokenquest is an idle RPG that runs next to your work. Start a quest, come back later, collect loot.
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
9. [Dungeons](#dungeons)
10. [Guilds](#guilds)
11. [Raids](#raids)
12. [Achievements, statistics and leaderboards](#achievements-statistics-and-leaderboards)
13. [Website](#website)
14. [Account and devices](#account-and-devices)
15. [What is sent to the server](#what-is-sent-to-the-server)
16. [Command reference](#command-reference)

## Getting started

You need Node.js 24 or newer and an access code from someone who runs the game.

```sh
npm install -g tokenquest
quest login --code <ACCESS_CODE>    # pick a character name, 2-20 letters, digits, _ or -
quest                               # start your first quest
```

That is all you need. Optionally connect Claude Code or your shell: they show your status and let monsters appear while you work.

**Claude Code:**

```
/plugin marketplace add Olesko24/tokenquest
/plugin install tokenquest@tokenquest
```

Your prompts send heartbeats. To see your status in Claude Code, add this to `~/.claude/settings.json`:

```json
{ "statusLine": { "type": "command", "command": "cat ~/.tokenquest/status.txt 2>/dev/null" } }
```

In Claude Code, run game commands with the `!` prefix, for example `! quest status`. They run in your shell and cost no tokens.

**Shell (zsh or bash):** add this to `~/.zshrc` or `~/.bashrc`:

```sh
eval "$(quest init zsh)"     # or: quest init bash
```

Your commands send heartbeats. For the status in your prompt, add `$(tokenquest_prompt)` to it, for example in zsh:

```sh
setopt prompt_subst
RPROMPT='$(tokenquest_prompt)'
```

## Heartbeats

Heartbeats are optional. Quests, dungeons and raids work without them.

A heartbeat comes from Claude Code (your prompts), the shell integration (your commands) or an open website tab (once a minute). Each source sends at most one per minute, in the background. Heartbeats refresh your status line and can spawn [random monsters](#random-encounters).

## Quests

Start a quest with `quest` or the **Start quest** button on the website. After 45 minutes the dice decide, you do not need to be online:

- 75% success chance, plus your **Luck**, at most 95%
- Success: 70 XP and 14–19 gold. **Fortune** adds percent to that gold
- Failure: 10 XP
- A successful quest has a 40% chance to drop an item, with two rarity rolls (the better one counts)

After a quest ends there is a 15-minute rest before the next one. Only one quest runs at a time.

```sh
quest status            # current quest and the last result
quest status --short    # the one-line status used by status lines, no network
```

## Character and levels

`quest char` shows your character. XP needed for the next level is 100 × level^1.5:

| Level | Total XP | Roughly |
|---|---|---|
| 5 | ~1,700 | 30 quests |
| 10 | ~11,000 | 200 quests |
| 20 | ~67,000 | 1,200 quests |

Higher levels mainly mean better loot (see below).

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

| Rarity | Primary stat | Bonus stats |
|---|---|---|
| Common | low | none |
| Rare | medium | 1 |
| Epic | high | 2 |
| Legendary | highest | 3 |

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

| Level | Common | Rare | Epic | Legendary |
|---|---|---|---|---|
| 1 | 90% | 10% | – | – |
| 2–4 | 89.4% | 10% | 0.5% | 0.1% |
| 5–9 | 74.5% | 22% | 3% | 0.5% |
| 10–14 | 59% | 30% | 9% | 2% |
| 15–24 | 50% | 33% | 13% | 4% |
| 25+ | 40% | 35% | 19% | 6% |

Quest loot rolls the rarity twice and keeps the better result, raids three times.

There is no minimum level to equip anything.

```sh
quest inv                         # equipped items and your bag
quest equip <#id>                 # rings: --slot ring1 or ring2
quest unequip <#id>
```

## Random encounters

Every heartbeat has a 2% chance to spawn a monster, at most one at a time. Your status line and the website show it. You have 5 minutes to fight, in the terminal or with the **Fight** button:

```sh
quest fight
```

Your win chance compares your attack and defense with the monster and adds your luck. It is always between 5% and 95%. Without gear an average monster is a coin flip.

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

The shop has three offers per day, the same for every player: one common, one rare and one epic item. They change at midnight UTC.

| Offer | Price | Needs |
|---|---|---|
| Common | 40 gold | – |
| Rare | 120 gold | – |
| Epic | 400 gold | level 5 |

You can buy each offer once per day. The stats are rolled when you buy. Legendaries are never sold.

```sh
quest shop
quest shop buy <1-3>
```

## Market

Players trade items on the market, but nobody picks or bids. Prices are fixed by rarity, and a purchase is a **draw**: you pay for a rarity and receive a random listed item of it.

| Rarity | Price | Draws unlock |
|---|---|---|
| Common | 20 gold | level 1 |
| Rare | 60 gold | level 1 |
| Epic | 200 gold | level 5 |
| Legendary | 800 gold | level 10 |

You get one draw per day (UTC). When your item is drawn, you receive the price minus a 10% fee. Listed items cannot be equipped, unlist them to take them back.

```sh
quest market
quest market draw <rarity>
quest market list <#id>
quest market unlist <#id>
```

## Dungeons

A dungeon is a run for 1–5 players: a 5-minute lobby, then three stages and a boss of 15 minutes each.

```sh
quest dungeon start          # opens a lobby and prints a join code
quest dungeon join <code>    # others join during the lobby
quest dungeon                # progress
```

Each stage succeeds or fails for the whole party. The chance depends on everyone's level and gear and a teamwork bonus per member. Nobody needs to be online during the run. Stages get 10% tougher and pay 10% more per member, so groups are rewarded but solo works too.

Every cleared stage pays XP and gold. A failed stage ends the run, you keep what you earned. Beating the boss gives every member a guaranteed item, with more rarity rolls in bigger parties.

## Guilds

```sh
quest guild create <name>    # you become the leader, the guild gets a join code
quest guild join <code>
quest guild leave
quest guild                  # members and guild level
```

A guild has up to 50 members. Its level grows with a tenth of the members' quest XP and with raid wins. If the leader leaves, the longest-standing member takes over. The last member to leave dissolves the guild.

## Raids

Raids are the only content that needs a guild.

```sh
quest raid schedule <minutes>   # leader only, 5 to 1440 minutes ahead
quest raid join                 # members join until it starts
quest raid                      # boss HP and damage per raider
```

A raid needs at least 5 raiders, otherwise it is cancelled at the start. It lasts 30 minutes in six 5-minute ticks. In every tick, every raider deals damage based on attack and defense, and the boss rolls a phase that makes it harder or easier to hit. Unequipped raids win about half the time, well-equipped ones up to about 85%. Nobody needs to be online during the raid.

A win gives every raider who dealt damage XP, gold and an item with three rarity rolls.

## Achievements, statistics and leaderboards

`quest stats` shows what you have done so far and your achievements. There are 18 achievements, from finishing your first quest to defeating a Dependency Dragon or winning a raid. They give no rewards. Once unlocked, an achievement stays, with its date.

`quest top` shows leaderboards: by level, by achievements and by guild level. You see the top 20 and your own rank. There is no gold leaderboard.

## Website

The website shows your character, equipment, bag, quest history, guild, shop, statistics and leaderboards. To log in, run `quest pair` and enter the code it shows.

## Account and devices

Tokenquest has no email and no password. Your login token on your devices is your account.

- To play on another device, run `quest pair` on a device that is logged in, then `quest login --pair <code>` on the new one within 10 minutes.
- **If you lose every logged-in device, your character is lost.** Keep it paired on a second device if you care about it.
- The token is stored in `~/.tokenquest/config.json`, readable only by you.

## What is sent to the server

- Heartbeats: only that one happened. No prompt, command, file or code content is ever sent.
- Commands you run, like starting a quest or equipping an item.
- Your character name. Nothing else about you.

## Command reference

| Command | What it does |
|---|---|
| `quest` | Start a quest |
| `quest status [--short]` | Current quest and the last result |
| `quest char` | Character sheet |
| `quest inv` | Inventory |
| `quest equip <#id> [--slot ring1\|ring2]` | Equip an item |
| `quest unequip <#id>` | Take an item off |
| `quest fight` | Fight a monster that showed up |
| `quest shop [buy <1-3>]` | Daily shop |
| `quest market [draw <rarity>\|list <#id>\|unlist <#id>]` | Market |
| `quest dungeon [start\|join <code>]` | Dungeons |
| `quest guild [create <name>\|join <code>\|leave]` | Guilds |
| `quest raid [schedule <minutes>\|join]` | Raids |
| `quest stats` | Statistics and achievements |
| `quest top [xp\|achievements\|guilds]` | Leaderboards |
| `quest login --code <code>` | New player |
| `quest pair` / `quest login --pair <code>` | Another device or the website |
| `quest init zsh\|bash` | Shell integration |
| `quest heartbeat` | Send a heartbeat, called by the integrations |
