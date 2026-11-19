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
COPY apps/web ./apps/web
COPY scripts/container-env.mjs ./scripts/container-env.mjs
# Geen build-args, databasecredentials of API-sleutels.
RUN pnpm --filter @jc/web build

FROM base AS runtime
ENV NODE_ENV=production DEMO_MODE=false EXTERNAL_WRITES_ENABLED=false PORT=3000
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/web
EXPOSE 3000
ENTRYPOINT ["node", "/app/scripts/container-env.mjs"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
