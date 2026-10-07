<p align="center"><img src="docs/icon.svg" alt="Dungeons &amp; Deploys icon: gold coin with a sword" width="128"></p>

# Dungeons & Deploys

An idle RPG for the terminal. Runs alongside Claude Code or any shell. Start a quest, keep working, collect loot.
Inspired by Twitch idle RPGs: luck and patience, not performance.

> **Beta.** Rules, numbers and basic mechanics can still change, and progress may be reset. See the [changelog](CHANGELOG.md).
>
> Works with Claude Code. Not affiliated with Anthropic.

New here? Read the [player manual](docs/manual.md).

## Principles

- **Fun on the side.** No performance tracking. Rewards depend on time, gear and dice, never on tokens, tickets or commits.
- **No presence required.** Start a quest and come back later. You never have to keep a terminal open.
- **Solo-friendly.** Quests and dungeons are playable alone. Groups give bonuses, never requirements.
- **Raids need a guild.** The only content that is group-only.
- **Zero token cost.** In Claude Code, game logic never runs through the model. Commands use the `!` shell prefix, hooks only send timestamps.
- **Server is authoritative.** Dice, loot and outcomes are decided on the server.

## Gameplay

| Content | Players | Notes |
|---|---|---|
| Quest | 1 | `quest` or a button on the website, result at once, then 45 min cooldown. 75% success plus luck |
| Random encounter | 1 | 2% chance per heartbeat (terminal, Claude Code or open website). Fight within 5 min |
| Dungeon | 1–5 | Three stages and a boss, 15 min each. Difficulty and loot scale with party size |
| Raid | 5+ | Guild only, scheduled by the leader. Ten bosses unlocked one by one, each needs more combat power and drops better loot |
| Market | – | Fixed prices by rarity, buyers draw a random listing, one draw per day |
| Shop | – | Three new offers every day, each once per player |
| Talents | – | One point per level up to 100, four trees of 8 talents with 36 ranks each, reset for 10 gold per point |
| Achievements | – | 19 achievements and a statistics page, just for fun |
| Leaderboards | – | Top 20 by level, combat power and achievements, every guild with size and average power |

Items drop in ten rarities and eleven equipment slots, with rolled stats and twelve weapon kinds.
Higher levels raise the chance for better loot. All items: see `apps/web/public/items/`.

### Heartbeats

A heartbeat is a plain CLI call (`quest heartbeat`). It is optional: quests, dungeons and raids do not need it.
Heartbeats refresh the status line and can spawn random monsters.

| Source | Heartbeat | Status display |
|---|---|---|
| Claude Code plugin | `UserPromptSubmit` hook | Claude Code statusline |
| Shell (zsh, bash) | `precmd` hook, every command | Prompt segment or tmux status |
| Website | Every minute while a tab is open | The website itself |

The server limits heartbeats to one per minute per player and source.

### Access

Public, invite-only. Players need the server URL (shipped with the CLI) and an access code.
In Claude Code, prefix commands with `!`.

```
quest login --code <ACCESS_CODE>   # register, pick a character name
quest pair                         # log in another device: quest login --pair <CODE>
quest                              # start quest
quest status
quest char                         # character sheet
quest inv / quest equip <item>
quest fight                        # random encounter
quest market                       # draw a random item of a rarity, list your own
quest shop                         # three new offers every day
quest stats                        # statistics and achievements
quest top [xp|power|achievements|guilds] # leaderboards
quest dungeon start|join <code>
quest guild create <name>|join <code>|leave
quest raid schedule <minutes> [boss]|join
```

## Install

Requires Node.js 24+.

```sh
npm install -g dungeons-and-deploys
quest login --code <ACCESS_CODE>
```

### Claude Code

```
/plugin marketplace add Olesko24/dungeons-and-deploys
/plugin install dungeons-and-deploys@dungeons-and-deploys
```

The plugin sends a heartbeat on prompts, so monsters can show up while you work. Plugins cannot set the statusline, so add it to `~/.claude/settings.json`:

```json
{
  "statusLine": { "type": "command", "command": "cat ~/.dungeons-and-deploys/status.txt 2>/dev/null" }
}
```

### Shell

Add to `~/.zshrc` (or `~/.bashrc` with `bash`):

```sh
eval "$(quest init zsh)"
```

Commands send heartbeats, so monsters can show up. For the status in your prompt, use `dnd_prompt`:

```sh
setopt prompt_subst
RPROMPT='$(dnd_prompt)'
```

## Architecture

```
Client (per player)                       Server
├─ CLI `quest`  ──── HTTPS + token ───►  API (Fastify)
├─ Heartbeat hook ── max 1/min, opt. ►    ├─ dice, loot, outcomes
│  (Claude Code or shell)                 │
└─ Statusline ◄── cached state ────────   ├─ queue workers (pg-boss)
                                          └─ Postgres
                                         Web (Vite SPA, served by the API)
                                          └─ character, guild hall, raid log
```

### Repository layout

```
dungeons-and-deploys/
├─ apps/
│  ├─ api/        Fastify API + queue workers
│  ├─ web/        Vite + React website (static)
│  └─ cli/        `quest` CLI, hooks, statusline, shell integration
├─ packages/
│  └─ shared/     Types, game rules, loot tables
└─ plugin/        Claude Code plugin manifest (commands, hooks, statusline)
```

### Stack

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript on Node.js | One language, shared types across API, web and CLI |
| Monorepo | pnpm workspaces | Simple, no extra build tooling |
| API | Fastify | Fast, small, good TypeScript support |
| Database | Postgres | Relational data (characters, items, guilds) |
| ORM | Prisma | Typed queries and migrations |
| Queue | pg-boss | Job queue inside Postgres, no Redis needed |
| Web | Vite + React (SPA) | Mostly dynamic and behind login, static files served by the API, no second server |

### Queues

A queue holds jobs that should run later or outside the request. Workers pick jobs up and execute them.

- `quest.resolve` – legacy, only resolves quests started before quests resolved at once.
- `raid.start` / `raid.tick` – scheduled by guild leaders, processes the shared boss fight.
- `dungeon.stage` – advances a dungeon to the next stage.

Why a queue instead of a timer in memory: jobs survive restarts, run exactly once across multiple API instances, and retry on failure.

### Load estimate (10,000 concurrent players)

| Source | Load |
|---|---|
| Heartbeats | up to ~170 req/s, read-only except for rare monster spawns |
| Quest resolutions | ~4 jobs/s |
| Statusline | 0, reads local cache |
| Raid start | short burst, absorbed by the queue |

A single Node process handles this. The database is the bottleneck to watch, not the runtime.
See [docs/hosting.md](docs/hosting.md) for sizing and operations.

## Roadmap

Phases 0–11 are built: accounts, quests, Claude Code and shell integrations, items and loot,
encounters, market, website, dungeons, guilds, raids, hardening, achievements and a daily shop.
Open: first deploy to Coolify, publishing the CLI to npm, monitoring alerts.

Details per phase: [docs/roadmap.md](docs/roadmap.md)

## Development

Requires Node.js 24+, pnpm and Docker. TypeScript runs directly in Node (type stripping), there is no build step.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev                                # Postgres on :5433, API on :3000
curl localhost:3000/health              # ok
pnpm --filter @dnd/api access-code --uses 5 --days 30
pnpm quest login --code <CODE>          # `pnpm quest` talks to localhost, the installed CLI to production
pnpm quest                              # start a quest, then: pnpm quest status, pnpm quest char
pnpm test                               # needs Postgres running, uses the `test` schema
pnpm --filter @dnd/web dev       # website on :5173, log in with a code from `pnpm quest pair`
pnpm typecheck
pnpm lint
pnpm --filter @dnd/api migrate   # create/apply migrations
```

Player-facing changes go into [CHANGELOG.md](CHANGELOG.md) under *Unreleased*, rules that players need to know into the [manual](docs/manual.md).
