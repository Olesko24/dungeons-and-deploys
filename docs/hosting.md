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

## Deploy

The API runs as a Coolify application built from this repository, at `https://tokenquest.meiners-dev.de`.
The CLI uses this URL by default, `TOKENQUEST_URL` overrides it on login.

| Setting | Value |
|---|---|
| Build pack | Dockerfile |
| Base directory | `/` |
| Dockerfile location | `apps/api/Dockerfile` |
| Port | 3000 |
| Health check | `GET /health` (also defined in the Dockerfile) |

Migrations run on container start (`prisma migrate deploy`). The image also contains the website, built in its own stage and served by the API.

Environment variables:

| Variable | Example |
|---|---|
| `DATABASE_URL` | Internal URL of the Coolify Postgres resource |

Admin scripts run inside the running container:

```sh
pnpm access-code --uses 10 --days 30
pnpm ban --name <character>            # --unban to lift it
```

Load test (seeds 10,000 `load_*` players, fires heartbeats, `--cleanup` removes them):

```sh
pnpm loadtest --url https://tokenquest.meiners-dev.de --seconds 60
pnpm loadtest --cleanup
```

## Operations

- **Backups:** Enable scheduled Postgres backups to S3 in Coolify from day one.
- **Monitoring:** Coolify uses the Dockerfile health check (`GET /health`, includes a database round trip). Enable Coolify notifications for failed health checks and deployments.
- **Connection pooling:** API and workers share a pool of 10–20 connections. Add PgBouncer only when running multiple API instances.
- **WebSockets:** 10,000 idle connections for live raids fit into a single Node process.
- **Splitting servers:** When load grows, move Coolify to a small dedicated server and run the game on a second one. Coolify manages multiple servers.
