# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @anthropic-ai/claude-code
WORKDIR /app
COPY --chown=node:node packages/claude-proxy/package.json ./package.json
COPY --chown=node:node packages/claude-proxy/src ./src
ENV NODE_ENV=production CLAUDE_PROXY_ENABLED=false
USER node
EXPOSE 11435
CMD ["node", "src/server.ts"]
