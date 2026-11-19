# syntax=docker/dockerfile:1
# Buildcontext is de monorepo-root. Geen productiecredentials tijdens de build.
FROM node:24-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.34.9
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages ./packages
# Devtools blijven beschikbaar voor tsx, Prisma-migraties en owner:create.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @jc/db generate

FROM dependencies AS build
COPY apps/worker ./apps/worker
COPY scripts/container-env.mjs scripts/worker-health.mjs ./scripts/

FROM base AS runtime
ENV NODE_ENV=production DEMO_MODE=false EXTERNAL_WRITES_ENABLED=false
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/worker
ENTRYPOINT ["node", "/app/scripts/container-env.mjs"]
CMD ["node", "--import", "tsx", "src/main.ts"]
