# Hosting

Tokenquest is hosted with [Coolify](https://coolify.io) on a single VPS.

## Sizing

Target: 10,000 concurrent players.

| Service | RAM | CPU |
|---|---|---|
| Coolify (incl. proxy) | ~1–1.5 GB | low |
| Postgres | 1–2 GB | main load |
| API + workers (Node) | ~300–500 MB | low at ~170 req/s |
| **Total** | **~2.5–4 GB** | |

| Phase | Server |
|---|---|
| Start / beta | 2 vCPU, 4 GB RAM, 40 GB NVMe |
| 10,000 concurrent | 4 vCPU, 8 GB RAM, 80 GB NVMe |

Start small. Scale the VPS vertically when needed.

## Presence storage

Never store heartbeats as rows. 10,000 players × 1/min would add ~14M rows per day.

Each active quest stores one bitmask, one bit per 5-minute slot:

```
quest 42: slots = 0b110111011   → 7 of 9 slots present
```

A heartbeat sets the bit of the current slot:

```sql
UPDATE quests SET slots = slots | $bit WHERE id = $id
```

With this model the database stays small (~10k characters, ~1M items, a few thousand guilds).

## Deploy

The API runs as a Coolify application built from this repository.

| Setting | Value |
|---|---|
| Build pack | Dockerfile |
| Base directory | `/` |
| Dockerfile location | `apps/api/Dockerfile` |
| Port | 3000 |
| Health check | `GET /health` (also defined in the Dockerfile) |

Migrations run on container start (`prisma migrate deploy`).

Environment variables:

| Variable | Example |
|---|---|
| `DATABASE_URL` | Internal URL of the Coolify Postgres resource |

Access codes are created inside the running container:

```sh
pnpm access-code --uses 10 --days 30
```

## Operations

- **Backups:** Enable scheduled Postgres backups to S3 in Coolify from day one.
- **Connection pooling:** API and workers share a pool of 10–20 connections. Add PgBouncer only when running multiple API instances.
- **WebSockets:** 10,000 idle connections for live raids fit into a single Node process.
- **Splitting servers:** When load grows, move Coolify to a small dedicated server and run the game on a second one. Coolify manages multiple servers.
