# Changelog

All notable changes for players. Dungeons & Deploys is in **beta**: rules, numbers and basic mechanics can change between
versions, and progress may be reset. Entries marked **Breaking** change how the game plays or affect existing characters.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Newest versions and entries come first.

## [Unreleased]

### Breaking

- A character can own 50 items. Scrap items for a quarter of their value with the **Scrap** button or
  `quest scrap <#id>`. With a full bag new loot is scrapped right away and paid out in gold, purchases wait
  until you make room.
- The market is new. Sellers set their own price, with a suggested value from rarity and roll. Every listing is
  visible with its stats and a price tag (Loot, Fair trade, Rip-off). Buyers line up for 30 minutes, then one is
  drawn and the others get their gold back. Without a line an item can be bought at once. Draws by rarity, the
  daily limit and the level locks are gone. Items listed before get their rarity's base price.
- Ten rarities instead of four: common, uncommon, rare, epic, legendary, mythic, ancient, divine, celestial and
  eternal. Higher rarities drop from higher levels, up to eternal from level 90, so gear keeps improving up to
  the level cap. **All items are reset.**
- Four new raid bosses for the late game, up to The Final Migration at 120000 recommended power.
- The shop offers an uncommon, an epic and a mythic item.

### Added

- Pixel-art icons for every monster, dungeon stage, raid boss, guild buff and achievement on the website.
- **Devices** at the top of the website (was **Terminal**) explains how to log in this character on another
  browser, your phone, the terminal or Claude Code, with the pair code shown large and a button for a new one.
  The manual has a step-by-step section under Account and devices.
- Public profiles on the website: click a name on a leaderboard to see the player's level, combat power, stats,
  guild, achievements and equipment. **Profile** at the top shows your own. Gold and the bag stay private.
- Auto-scrap: loot below a rarity you pick is scrapped on arrival and paid out in gold. Set it above your bag on
  the website or with `quest autoscrap <rarity>|off`.
- The market shows the average sale price per rarity over the last 7 days, in `quest market` and when you sell
  on the website.
- The status line shows your rested quests while you rest or your quest is ready.
- Rested quests: every 45 minutes without a quest earn one, up to 6. A rested quest gives 50% more XP and gold,
  so a night's sleep catches up a little. Status and the website show how many you have.
- Upgrade items: fuse 3 bag items of one rarity into a random item of the next rarity with the **Upgrade**
  button or `quest upgrade <#id> <#id> <#id>`.
- Shards: dungeon and raid bosses have a 30% chance to drop a shard on top of their loot. Forge it into a random
  item of its rarity in the bag or with `quest forge <rarity>`. Shards do not count against the bag limit.
- Equipped items show their name in the equipment panel.
- Inbox on the website and with `quest inbox`: market sales and draws, dungeon and raid results, guild news and
  achievements, also from while you were away. Delete single entries or clear it.
- A live countdown to the next quest at the top of the status, with a rest bar and the start button waiting
  next to it. The browser tab title shows the countdown too.
- Short alert sounds on the website when a quest is ready, a monster shows up, or a dungeon or raid starts
  and ends. **Sound on** at the top mutes them.
- Stats with icons on the website: the character header shows level, power, gold and every stat as tiles, and
  equipped items show their stats in the equipment slots.
- Bad luck protection: after three successful quests without loot, the next successful quest always drops an
  item.
- Dungeons, market and raids on the website: start or join a dungeon, sell and draw items on the market, and
  schedule or join a raid, without the terminal.
- The guild leaderboard lists every guild with its member count and average combat power, and the guild hall
  shows the same list to players without a guild.
- The shop shows the stats of its offers before you buy. Every buyer gets the same item.
- Every rarity has its own symbol on the website, and the shop shows a rarity legend.
- Ideas: suggest features for the game and upvote the ones you want, linked at the bottom of the website.
- Found, join and leave a guild from the guild hall on the website.
- Combat power, shown on the character and as a recommendation for every monster and dungeon stage, with its own
  leaderboard (`quest top power`).
- Six raid bosses from The Monolith to The Big Rewrite, each needing more combat power and paying more XP, gold
  and better loot. Guilds unlock them one by one.
- Guild bank and guild buffs: members donate gold and every quest adds 10% of its gold on top. The leader buys
  buffs for every member, such as +10% XP or +5% combat power, for 24 hours.
- Start on the website: create a character with an access code, no terminal needed. **Terminal** on the website
  shows how to install the CLI and a pair code to connect it. The start page explains how to get the CLI.
- Interactive website tour on the first visit, restartable with the Tour button. Finishing it unlocks the
  achievement Hello, World.
- Talents: one point per level in four trees (offense, defense, luck, general) of 8 talents each, with rows that
  open with points spent and prerequisites. `quest talents` or the talent trees with icons on the website.
  A reset costs 10 gold per spent point.
- Level cap 100.
- Short stories for every quest, monster fight, dungeon stage and raid tick: what happened, in the CLI and on the
  website.

### Changed

- The website shows market and shop cards, the bag, the status panel, raids, the guild hall and achievements with
  one detail per line instead of long lines joined by dots.
- The shop has no level locks anymore. Epic and mythic offers only need the gold, like items on the market.
- The quest history on the website shows the last 5 quests, **Show last 20** opens the rest.
- **Breaking:** Tokenquest is now called **Dungeons & Deploys**. The npm package and the Claude Code plugin are
  `dungeons-and-deploys`, local files move to `~/.dungeons-and-deploys` (log in again), the prompt function is
  `dnd_prompt` and the server override `DND_URL`. The command stays `quest`.
- **Breaking:** Quests resolve at once. `quest` and the website show the quest name, XP, gold and any loot right away,
  then a 45-minute rest follows (was: 45-minute quest plus 15-minute rest).

### Security

- `quest logout` ends the session on this device, `quest logout --all` ends every session, for example after losing
  a laptop. Sessions expire after a year, log in again with `quest pair`.
- The server accepts three heartbeats per minute per player, however many devices are logged in.
- A player is in one dungeon and one raid at a time. Leaving a guild also leaves its planned raid.
- Fixed a market bug where a listing taken back while a buyer joined the line kept the buyer's gold.

## [0.1.0] – Beta

First public beta.

### Added

- Registration with an access code and a character name, no email. Further devices and the website log in with a
  code from `quest pair`.
- Quests of 45 minutes: start one, come back later. 75% success chance plus luck, no presence needed.
- Heartbeats from Claude Code (plugin, every prompt), zsh or bash (every command) or an open website tab spawn
  random monsters and refresh a one-line status for status lines and prompts.
- Items in 11 slots and 4 rarities with rolled stats (attack, defense, luck, fortune), name prefixes from the
  strongest bonus and 12 weapon kinds. Better loot at higher levels.
- Random encounters with eight monsters, `quest fight`.
- Daily shop with three offers.
- Market with fixed prices and random draws.
- Dungeons for 1–5 players with three stages and a boss.
- Guilds with join codes and guild levels.
- Guild raids with at least 5 raiders and shared boss HP.
- 18 achievements, statistics and leaderboards.
- Website with quest and fight buttons, character, equipment, quest history, guild, raid, shop, statistics and leaderboards, with pixel icons
  for gold and every section.
- Player [manual](docs/manual.md) and this changelog, on the website and via `quest manual` and `quest changelog`.

[Unreleased]: https://github.com/Olesko24/dungeons-and-deploys/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Olesko24/dungeons-and-deploys/releases/tag/v0.1.0
