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

- [ ] Tables: `users`, `access_codes`, `sessions`
- [ ] Access codes with max uses and expiry, created via admin script
- [ ] `POST /auth/register` – access code + email → magic link, returns a login id and a short confirm code
- [ ] `GET /auth/verify` – magic link opens a confirm page showing the confirm code, confirming approves the login
- [ ] `GET /auth/poll/:loginId` – CLI polls until approved, then receives the API token (like device login in GitHub CLI)
- [ ] Email sending via SMTP (nodemailer)
- [ ] Rate limit on auth routes
- [ ] CLI: `quest login --code <CODE>`, shows the confirm code, waits, stores the token in `~/.tokenquest/config.json`

**Done when:** A new player registers with a valid code, an invalid or used-up code is rejected, the CLI holds a working token.

## Phase 2 – Quest core

- [ ] Tables: `characters`, `quests` (incl. `slots` bitmask, see [hosting.md](hosting.md))
- [ ] Character created on first login (name, level, XP, gold)
- [ ] pg-boss set up in the API process
- [ ] `POST /quests` – start quest, enforce cooldown, schedule `quest.resolve` in 45 min
- [ ] `POST /heartbeat` – set slot bit of the active quest, max 1/min per player
- [ ] Worker `quest.resolve` – check presence, roll success, grant XP and gold
- [ ] Level curve in `packages/shared`
- [ ] CLI: `quest`, `quest status`, `char`

**Done when:** Tests with a fake clock cover quest success, quest failure and cooldown. A quest started locally resolves after restarting the API.

## Phase 3 – Integrations and first deploy

- [ ] CLI: `quest heartbeat` (sends at most 1/min, fire and forget), `quest status --short` for status lines
- [ ] Claude Code plugin: `UserPromptSubmit` heartbeat hook, statusline, CLI bundled
- [ ] Shell integration: `quest init zsh|bash` prints a `precmd` hook and a prompt segment
- [ ] Statusline reads local cache, CLI refreshes it
- [ ] CLI published to npm
- [ ] Dockerfiles for API and web
- [ ] Deploy to Coolify, Postgres backups to S3 enabled
- [ ] Install guide in README

**Done when:** One person plays via the Claude Code plugin, another via the shell integration. Both log in with a code and finish a quest against the deployed server.

## Phase 4 – Items and loot

- [ ] Tables: `items` (templates), `inventory`
- [ ] Rarities: common, rare, epic, legendary
- [ ] Loot tables in `packages/shared`, extra present slots improve rolls
- [ ] Equipment slots, item stats affect quest success chance
- [ ] CLI: `inv`, `equip <item>`

**Done when:** Tests show loot distribution matches rarity weights. Equipped items change quest odds.

## Phase 5 – Random encounters

- [ ] Heartbeat has a small chance to spawn an encounter (rolled on the server)
- [ ] Encounter expires after 5 min, `quest.encounter.expire` job
- [ ] `POST /fight` – dice duel, loot on win
- [ ] Statusline shows active encounter

**Done when:** An encounter appears, can be fought within 5 min and is gone afterwards.

## Phase 6 – Website

- [ ] Next.js app, login via magic link, styled per [style.md](style.md)
- [ ] Character sheet, inventory, quest history
- [ ] Deployed via Coolify

**Done when:** A player sees their character in the browser after logging in.

## Phase 7 – Dungeons

- [ ] Dungeon = chain of 3 stages + boss, `dungeon.stage` job
- [ ] Party of 1–5, `dungeon start` / `dungeon join <id>`
- [ ] Difficulty and loot scale with party size, solo is possible
- [ ] Presence counts per member

**Done when:** A solo run and a 3-player run both complete with scaled rewards.

## Phase 8 – Guilds

- [ ] Tables: `guilds`, `guild_members` (roles: leader, member)
- [ ] CLI: `guild create|join|leave|info`
- [ ] Guild level grows from members' quests
- [ ] Guild hall page on the website

**Done when:** Players create, join and leave guilds. Guild level rises from member activity.

## Phase 9 – Raids

- [ ] Leader schedules a raid, `raid.start` job
- [ ] Minimum player count, raid cancelled if not reached
- [ ] Shared boss HP, `raid.tick` jobs apply damage from present members
- [ ] Loot for all participants
- [ ] Live raid view on the website (WebSockets)

**Done when:** A raid with 5 players runs from schedule to loot. A raid below the minimum is cancelled.

## Phase 10 – Hardening

- [ ] Load test with 10,000 simulated players (autocannon)
- [ ] Monitoring: health checks and error alerts in Coolify
- [ ] Admin script: access codes, ban player

**Done when:** The load test holds ~170 heartbeats/s with stable response times on the target server size.

## Open decisions

- Domain and server URL
- SMTP provider for magic links
- Game content: quest texts, item names, monsters
