# Build context: repository root. docker build -f apps/api/Dockerfile .
FROM node:24-slim AS web
RUN npm install -g pnpm@12.9.1 && rm -rf /root/.npm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=pnpm-meta,target=/root/.cache \
    pnpm install --frozen-lockfile --filter @dnd/web...
COPY tsconfig.base.json CHANGELOG.md ./
COPY docs/manual.md docs/
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @dnd/web build

FROM node:24-slim

RUN npm install -g pnpm@12.9.1 && rm -rf /root/.npm
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
# The Prisma CLI is a regular dependency because migrate deploy runs at container start.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=pnpm-meta,target=/root/.cache \
    pnpm install --frozen-lockfile --prod --filter @dnd/api...

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY --from=web /app/apps/web/dist apps/web/dist

WORKDIR /app/apps/api
USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec node src/server.ts"]
