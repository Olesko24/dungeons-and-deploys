# Roadmap

Phases are worked through in order. Each step ends with a check that proves it works.
Every phase ends in a playable or deployable state.

## Phase 0 – Foundation

- [x] pnpm workspace with `apps/api`, `apps/cli`, `apps/web`, `packages/shared`
- [x] TypeScript config shared across packages
- [x] `docker-compose.yml` with Postgres for local development
- [x] Prisma schema and migrations (`prisma migrate`)
- [x] Fastify API with `GET /health`
- [x] Test runner: `node:test`

**Done when:** `pnpm dev` starts Postgres and API, `curl /health` returns `ok`, `pnpm test` runs.

## Phase 1 – Accounts

No email: the API token on the player's devices is the identity. Losing all devices loses the character.

- [x] Tables: `users`, `access_codes`, `sessions`, `pair_codes`
- [x] Access codes with max uses and expiry, created via admin script
- [x] `POST /auth/register` – access code + character name → API token
- [x] `POST /auth/pair` – logged-in device gets a single-use code, valid 10 min
- [x] `POST /auth/pair/redeem` – pair code → API token for another device
- [x] Rate limit on auth routes
- [x] CLI: `quest login --code <CODE>`, `quest pair`, `quest login --pair <CODE>`, token stored in `~/.tokenquest/config.json`

**Done when:** A new player registers with a valid code, an invalid or used-up code is rejected, the CLI holds a working token.

## Phase 2 – Quest core

- [x] Tables: `characters`, `quests` (incl. `slots` bitmask, see [hosting.md](hosting.md))
- [x] Character created on registration (name, level, XP, gold)
- [x] pg-boss set up in the API process, hourly cleanup of expired logins
- [x] `POST /quests` – start quest, enforce cooldown, schedule `quest.resolve` in 45 min
- [x] `POST /heartbeat` – set slot bit of the active quest, max 1/min per player
- [x] Worker `quest.resolve` – check presence, roll success, grant XP and gold
- [x] `GET /quests/current`, `GET /character` for status and character sheet
- [x] Level curve and quest rules in `packages/shared`
- [x] CLI: `quest`, `quest status`, `quest char`

**Done when:** Tests with a fake clock cover quest success, quest failure and cooldown. A quest started locally resolves after restarting the API.

## Phase 3 – Integrations and first deploy

- [x] CLI: `quest heartbeat` (sends at most 1/min, fire and forget), `quest status --short` for status lines
- [x] Claude Code plugin: `UserPromptSubmit` heartbeat hook, repo is the marketplace. CLI comes from npm, statusline is a settings snippet (plugins cannot set it)
- [x] Shell integration: `quest init zsh|bash` prints a `precmd` hook and a prompt segment
- [x] Statusline reads local cache (`~/.tokenquest/status.txt`), heartbeat and CLI refresh it
- [x] CLI build for npm (`tokenquest` package)
- [ ] CLI published to npm
- [x] Dockerfile for the API (web follows in Phase 6)
- [ ] Deploy to Coolify, Postgres backups to S3 enabled
- [x] Install guide in README, deploy guide in [hosting.md](hosting.md)

**Done when:** One person plays via the Claude Code plugin, another via the shell integration. Both log in with a code and finish a quest against the deployed server.

## Phase 4 – Items and loot

- [x] Item catalog in `packages/shared`: 9 armor and jewelry types plus 12 weapon kinds (dagger to crossbow), each in 4 rarities. Weapon kinds have their own attack weight and signature stat. Table `items` stores owned items by catalog key
- [x] Rarities: common, rare, epic, legendary
- [x] Slots: head, chest, legs, hands, feet, weapon + shield or two-handed, 2 rings, necklace, earrings
- [x] Stats rolled on drop: primary stat by type (ATK weapons, DEF armor and shield, LCK rings, FOR necklace and earrings), random bonus stats from rare upward, name prefix from the strongest bonus. LCK raises success chance, FOR raises gold, ATK and DEF take effect in phase 5
- [x] Loot table by character level, 40% drop chance on success, extra present slots add rarity rolls. No minimum level to equip
- [x] CLI: `quest inv`, `quest equip <#id>`, `quest unequip <#id>`, rarity colors
- [x] 16×16 pixel icons for all 84 items (`apps/web/scripts/item-icons.ts`)

**Done when:** Tests show loot distribution matches rarity weights. Equipped items change quest odds.

## Phase 5 – Random encounters

- [x] Heartbeat has a 2% chance to spawn an encounter (rolled on the server), one monster at a time
- [x] Encounter expires after 5 min. Checked on read, no expiry job needed
- [x] Eight monsters from Bug Swarm to Dependency Dragon, rarer ones are tougher and pay more
- [x] `POST /fight` – win chance from attack, defense and luck against the monster's power (5–95%), XP, gold and loot on win, nothing lost on defeat
- [x] Statusline shows active encounter, CLI: `quest fight`

**Done when:** An encounter appears, can be fought within 5 min and is gone afterwards.

## Phase 5b – Market

Fair by chance, not by bidding. More gold must not mean better equipment.

- [x] Players list unequipped items, the price is fixed by rarity (20 / 60 / 200 / 800 gold)
- [x] Buyers pay the fixed price for a draw from one rarity and get a random listed item of that rarity
- [x] Daily draw limit per player (1 per UTC day)
- [x] Epic draws from level 5, legendary draws from level 10
- [x] 10% fee on sales as a gold sink
- [x] CLI: `quest market`, `quest market draw <rarity>`, `quest market list|unlist <#id>`

**Done when:** A listed item reaches a random buyer, the seller gets the price minus the fee, the daily limit holds.

## Phase 6 – Website

- [x] Vite + React SPA in `apps/web`, styled per [style.md](style.md)
- [x] Served as static files by the API (same origin, no extra container)
- [x] Login with a code from `quest pair`, session cookie
- [x] Character sheet, status with running quest and monster, equipment slots, bag with equip, quest history
- [x] Built in the API Docker image, so it deploys with the API

**Done when:** A player sees their character in the browser after logging in.

## Phase 7 – Dungeons

- [x] Dungeon = 5-minute lobby, then 3 stages + boss of 15 minutes each, `dungeon.stage` job per stage
- [x] Party of 1–5, `quest dungeon start` / `quest dungeon join <code>`
- [x] Stage chance from the members' gear against the stage, times the party's presence in that stage, plus teamwork per member
- [x] Difficulty and rewards grow 10% per member, solo is possible, a failed stage ends the run and keeps earned rewards
- [x] Boss kill gives every member guaranteed loot, bigger parties roll rarity more often
- [x] Presence counts per member (own slot bitmask per run)

**Done when:** A solo run and a 3-player run both complete with scaled rewards.

## Phase 8 – Guilds

- [x] Tables: `guilds`, `guild_members` (roles: leader, member), join by guild code, max 50 members
- [x] CLI: `quest guild create <name>|join <code>|leave`, `quest guild` for info
- [x] Guild level grows from 1/10 of members' quest XP
- [x] Leaving leader hands over to the longest-standing member, the last member dissolves the guild
- [x] Guild hall section on the website

**Done when:** Players create, join and leave guilds. Guild level rises from member activity.

## Phase 9 – Raids

- [x] Guild leader schedules a raid 5 min to 24 h ahead, members join until it starts
- [x] At least 5 raiders, otherwise the raid is cancelled
- [x] Shared boss HP sized at 85% of the raid's full-presence damage, `raid.tick` jobs every 5 min for 30 min apply damage from present members
- [x] Loot for every raider who dealt damage, raid XP also feeds the guild
- [x] Raid view on the website, refreshed every 5 seconds while running (polling instead of WebSockets: 5-minute ticks need nothing faster)
- [x] CLI: `quest raid schedule <minutes>`, `quest raid join`, `quest raid`

**Done when:** A raid with 5 players runs from schedule to loot. A raid below the minimum is cancelled.

## Phase 10 – Hardening

- [x] Load test with 10,000 simulated players (`pnpm --filter @tokenquest/api loadtest`, autocannon)
- [ ] Monitoring: health checks and error alerts in Coolify (health check is in the Dockerfile, alerts are Coolify settings)
- [x] Admin scripts: `access-code`, `ban --name <character> [--unban]`

**Done when:** The load test holds ~170 heartbeats/s with stable response times on the target server size.

Measured locally (single Node process, Postgres in Docker, Apple Silicon): 165 heartbeats/s with 10,000 players, 0 errors, p50 24 ms, p99 88 ms, API at ~300 MB RSS. At 600/s still 0 errors with p99 60 ms. Still to repeat on the deployed server.

## Phase 11 – Achievements, statistics and shop

- [x] Statistics counted from existing tables (`GET /stats`, `quest stats`, Stats page on the website)
- [x] 18 achievements checked after every player action and job, stored with their unlock date in `achievements`. Once unlocked they stay, no rewards
- [x] Daily shop: three offers (common, rare, epic) the same for every player, new at midnight UTC
- [x] Each offer once per player and day, prices 40 / 120 / 400 gold, epic from level 5, no legendaries
- [x] CLI: `quest shop`, `quest shop buy <1-3>`, website Shop page

**Done when:** A player sees stats and unlocked achievements, buys a shop offer once per day.

## Open decisions

- Game content: quest texts, item names, monsters
