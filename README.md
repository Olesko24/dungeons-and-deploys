<p align="center"><img src="docs/icon.svg" alt="Tokenquest icon: gold coin with a sword" width="128"></p>

# Tokenquest

An idle RPG for the terminal. Runs alongside Claude Code or any shell. Start a quest, keep working, collect loot.
Inspired by Twitch idle RPGs: presence and luck, not performance.

> Works with Claude Code. Not affiliated with Anthropic.

## Principles

- **Fun on the side.** No performance tracking. Rewards depend on presence and dice, never on tokens, tickets or commits.
- **Solo-friendly.** Quests and dungeons are playable alone. Groups give bonuses, never requirements.
- **Raids need a guild.** The only content that is group-only.
- **Zero token cost.** In Claude Code, game logic never runs through the model. Commands use the `!` shell prefix, hooks only send timestamps.
- **Server is authoritative.** Clients report presence. Dice, loot and outcomes are decided on the server.

## Gameplay

| Content | Players | Notes |
|---|---|---|
| Quest | 1 | `quest`, 45 min, then cooldown. Success depends on presence during the quest |
| Random encounter | 1 | Small chance per heartbeat. `quest fight` within 5 min |
| Dungeon | 1–5 | Chain of quests with a boss. Difficulty and loot scale with party size |
| Raid | ~5+ | Guild only, scheduled. Shared boss HP, damage from presence in the raid window |

### Presence

A quest is split into 5-minute slots. Each slot with at least one heartbeat counts as present.
Enough present slots → quest succeeds. More slots → better loot rolls.

### Integrations

A heartbeat is a plain CLI call (`quest heartbeat`). Any integration that calls it counts as presence.

| Integration | Heartbeat | Status display |
|---|---|---|
| Claude Code plugin | `UserPromptSubmit` hook | Claude Code statusline |
| Shell (zsh, bash) | `precmd` hook, every command | Prompt segment or tmux status |

Both can run at the same time. The server limits heartbeats to one per minute per player.

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
quest dungeon start|join <code>
quest guild create <name>|join <code>|leave
quest raid join
```

## Install

Requires Node.js 24+.

```sh
npm install -g tokenquest
quest login --code <ACCESS_CODE>
```

### Claude Code

```
/plugin marketplace add Olesko24/tokenquest
/plugin install tokenquest@tokenquest
```

The plugin sends a heartbeat on every prompt. Plugins cannot set the statusline, so add it to `~/.claude/settings.json`:

```json
{
  "statusLine": { "type": "command", "command": "cat ~/.tokenquest/status.txt 2>/dev/null" }
}
```

### Shell

Add to `~/.zshrc` (or `~/.bashrc` with `bash`):

```sh
eval "$(quest init zsh)"
```

Every command counts as presence. For the status in your prompt, use `tokenquest_prompt`:

```sh
setopt prompt_subst
RPROMPT='$(tokenquest_prompt)'
```

## Architecture

```
Client (per player)                       Server
├─ CLI `quest`  ──── HTTPS + token ───►  API (Fastify)
├─ Heartbeat hook ── max 1/min ──────►    ├─ dice, loot, outcomes
│  (Claude Code or shell)                 │
└─ Statusline ◄── cached state ────────   ├─ queue workers (pg-boss)
                                          └─ Postgres
                                         Web (Vite SPA, served by the API)
                                          └─ character, guild hall, raid log
```

### Repository layout

```
tokenquest/
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

- `quest.resolve` – scheduled when a quest starts, runs 45 min later: check presence, roll loot.
- `raid.start` / `raid.tick` – scheduled by guild leaders, processes the shared boss fight.
- `dungeon.stage` – advances a dungeon to the next stage.

Why a queue instead of a timer in memory: jobs survive restarts, run exactly once across multiple API instances, and retry on failure.

### Load estimate (10,000 concurrent players)

| Source | Load |
|---|---|
| Heartbeats | ~170 req/s, batched before writing to the database |
| Quest resolutions | ~4 jobs/s |
| Statusline | 0, reads local cache |
| Raid start | short burst, absorbed by the queue |

A single Node process handles this. The database is the bottleneck to watch, not the runtime.
See [docs/hosting.md](docs/hosting.md) for sizing, presence storage and operations.

## Roadmap

1. Login with access code, character, quest resolved on the server, CLI, heartbeat hook, statusline
2. Random encounters, loot tables
3. Dungeons (1–5 players)
4. Guilds
5. Raids

Detailed phases with steps: [docs/roadmap.md](docs/roadmap.md)

## Development

Requires Node.js 24+, pnpm and Docker. TypeScript runs directly in Node (type stripping), there is no build step.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev                                # Postgres on :5433, API on :3000
curl localhost:3000/health              # ok
pnpm --filter @tokenquest/api access-code --uses 5 --days 30
pnpm quest login --code <CODE>          # `pnpm quest` talks to localhost, the installed CLI to production
pnpm quest                              # start a quest, then: pnpm quest status, pnpm quest char
pnpm test                               # needs Postgres running, uses the `test` schema
pnpm --filter @tokenquest/web dev       # website on :5173, log in with a code from `pnpm quest pair`
pnpm typecheck
pnpm lint
pnpm --filter @tokenquest/api migrate   # create/apply migrations
```
