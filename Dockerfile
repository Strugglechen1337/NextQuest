# syntax=docker/dockerfile:1
# NextQuest – Produktions-Image (Multi-Stage für linux/amd64 + linux/arm64)
# Node 22 bringt SQLite (node:sqlite) mit, es werden keine nativen Pakete gebaut.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-slim AS build
WORKDIR /app
ARG GIT_COMMIT=dev
ARG NEXTQUEST_COMMIT=${GIT_COMMIT}
ARG BUILT_AT=""
ARG NEXTQUEST_BUILT_AT=${BUILT_AT}
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXTQUEST_RUNTIME=docker \
    NEXTQUEST_COMMIT=${NEXTQUEST_COMMIT} \
    NEXTQUEST_BUILT_AT=${NEXTQUEST_BUILT_AT}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app

LABEL org.opencontainers.image.title="NextQuest" \
      org.opencontainers.image.description="Deine gesamte Spielesammlung an einem Ort – und die Antwort auf: Was spiele ich als Nächstes?" \
      org.opencontainers.image.source="https://github.com/Strugglechen1337/NextQuest"

# Version für /api/version und In-App-Anzeige (wird per Build-Arg im Workflow oder lokal gesetzt)
ARG GIT_COMMIT=dev
ARG NEXTQUEST_COMMIT=${GIT_COMMIT}
ARG BUILT_AT=""
ARG NEXTQUEST_BUILT_AT=${BUILT_AT}

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_NO_WARNINGS=1 \
    NEXTQUEST_RUNTIME=docker \
    NEXTQUEST_COMMIT=${NEXTQUEST_COMMIT} \
    NEXTQUEST_BUILT_AT=${NEXTQUEST_BUILT_AT} \
    TZ=Europe/Berlin \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

RUN mkdir -p /data/backups /app/.next/cache && chown -R node:node /data /app

COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
