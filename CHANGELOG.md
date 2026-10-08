# Changelog

All notable changes for players. Dungeons & Deploys is in **beta**: rules, numbers and basic mechanics can change between
versions, and progress may be reset. Entries marked **Breaking** change how the game plays or affect existing characters.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Breaking

- Ten rarities instead of four: common, uncommon, rare, epic, legendary, mythic, ancient, divine, celestial and
  eternal. Higher rarities drop from higher levels, up to eternal from level 90, so gear keeps improving up to
  the level cap. **All items are reset.**
- Four new raid bosses for the late game, up to The Final Migration at 120000 recommended power.
- The shop offers an uncommon, an epic and a mythic item. Market draws exist for every rarity.

### Added

- The shop shows the stats of its offers before you buy. Every buyer gets the same item.
- The guild leaderboard lists every guild with its member count and average combat power, and the guild hall
  shows the same list to players without a guild.
- Every rarity has its own symbol on the website, and the shop shows a rarity legend.
- Ideas: suggest features for the game and upvote the ones you want, linked at the bottom of the website.
- Found, join and leave a guild from the guild hall on the website.
- Dungeons, market and raids on the website: start or join a dungeon, sell and draw items on the market, and
  schedule or join a raid, without the terminal.
- Talents: one point per level in four trees (offense, defense, luck, general) of 8 talents each, with rows that
  open with points spent and prerequisites. `quest talents` or the talent trees with icons on the website.
  A reset costs 10 gold per spent point.
- Level cap 100.
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
- Short stories for every quest, monster fight, dungeon stage and raid tick: what happened, in the CLI and on the
  website.

### Changed

- **Breaking:** Tokenquest is now called **Dungeons & Deploys**. The npm package and the Claude Code plugin are
  `dungeons-and-deploys`, local files move to `~/.dungeons-and-deploys` (log in again), the prompt function is
  `dnd_prompt` and the server override `DND_URL`. The command stays `quest`.
- **Breaking:** Quests resolve at once. `quest` and the website show the quest name, XP, gold and any loot right away,
  then a 45-minute rest follows (was: 45-minute quest plus 15-minute rest).

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
