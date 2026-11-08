const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Dockerfile erfüllt alle Vorgaben für das Multi-Stage-Produktionsimage", () => {
  const dockerfile = read("Dockerfile");
  assert.ok(!dockerfile.includes("\r\n"), "Dockerfile sollte LF-Zeilenumbrüche verwenden");
  assert.match(dockerfile, /^FROM node:22-slim AS deps/m);
  assert.match(dockerfile, /^FROM node:22-slim AS build/m);
  assert.match(dockerfile, /^FROM node:22-slim AS run/m);
  assert.match(dockerfile, /ARG NEXTQUEST_COMMIT/);
  assert.match(dockerfile, /NEXTQUEST_RUNTIME=docker/);
  assert.match(dockerfile, /NEXTQUEST_COMMIT=\$\{NEXTQUEST_COMMIT\}/);
  assert.match(dockerfile, /TZ=Europe\/Berlin/);
  assert.match(dockerfile, /PORT=3000/);
  assert.match(dockerfile, /DATA_DIR=\/data/);
  assert.match(dockerfile, /org\.opencontainers\.image\.source="https:\/\/github\.com\/Strugglechen1337\/NextQuest"/);
  assert.match(dockerfile, /COPY --from=build --chown=node:node \/app\/public \.\/public/);
  assert.match(dockerfile, /COPY --from=build --chown=node:node \/app\/\.next\/standalone \.\//);
  assert.match(dockerfile, /COPY --from=build --chown=node:node \/app\/\.next\/static \.\/\.next\/static/);
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^VOLUME \["\/data"\]$/m);
  assert.match(dockerfile, /^EXPOSE 3000$/m);
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/api\/health/);
  assert.match(dockerfile, /^CMD \["node", "server\.js"\]$/m);
});

test("GitHub-Actions-Workflow baut und pusht Multi-Arch-Image nach GHCR", () => {
  const workflow = read(".github/workflows/docker.yml");
  assert.ok(!workflow.includes("\r\n"), "docker.yml sollte LF-Zeilenumbrüche verwenden");
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /tags:\s*\n\s*- "v\*"/);
  assert.match(workflow, /packages:\s*write/);
  assert.match(workflow, /ghcr\.io\/strugglechen1337\/nextquest/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /docker\/setup-qemu-action@v3/);
  assert.match(workflow, /docker\/setup-buildx-action@v3/);
  assert.match(workflow, /docker\/login-action@v3/);
  assert.match(workflow, /secrets\.GITHUB_TOKEN/);
  assert.match(workflow, /docker\/metadata-action@v5/);
  assert.match(workflow, /docker\/build-push-action@v6/);
  assert.match(workflow, /platforms:\s*linux\/amd64,linux\/arm64/);
  assert.match(workflow, /type=raw,value=latest/);
  assert.match(workflow, /type=sha,prefix=,format=short/);
  assert.match(workflow, /type=semver,pattern=\{\{version\}\}/);
  assert.match(workflow, /org\.opencontainers\.image\.source=https:\/\/github\.com\/Strugglechen1337\/NextQuest/);
  assert.match(workflow, /NEXTQUEST_COMMIT=/);
});

test("docker-compose.yml nutzt fertiges GHCR-Image mit optionalem Build und Watchtower", () => {
  const compose = read("docker-compose.yml");
  assert.ok(!compose.includes("\r\n"), "docker-compose.yml sollte LF-Zeilenumbrüche verwenden");
  assert.match(compose, /image:\s*ghcr\.io\/strugglechen1337\/nextquest:latest/);
  assert.match(compose, /#\s*build:/);
  assert.match(compose, /restart:\s*unless-stopped/);
  assert.match(compose, /APP_PASSWORD:\s*\$\{APP_PASSWORD:-\}/);
  assert.match(compose, /TZ:\s*\$\{TZ:-Europe\/Berlin\}/);
  assert.match(compose, /nextquest-data:\/data/);
  assert.match(compose, /#\s*watchtower:/);
  assert.match(compose, /containrrr\/watchtower/);
});

test("Update-Skript, HERMES-Doku und README sind auf das fertige Image ausgerichtet", () => {
  const updateSh = read("scripts/update.sh");
  assert.ok(!updateSh.includes("\r\n"), "scripts/update.sh sollte LF-Zeilenumbrüche verwenden");
  assert.match(updateSh, /VERALTET/i);
  assert.match(updateSh, /docker compose pull/);
  assert.ok(!updateSh.includes("docker compose build"), "scripts/update.sh soll nicht mehr lokal bauen");

  const hermes = read("docs/HERMES.md");
  assert.match(hermes, /ghcr\.io\/strugglechen1337\/nextquest:latest/);
  assert.match(hermes, /docker compose pull && docker compose up -d/);
  assert.match(hermes, /\/data\/backups/);

  const readme = read("README.md");
  assert.match(readme, /^## Docker$/m);
  assert.match(readme, /docker compose up -d/);
  assert.match(readme, /docker compose pull && docker compose up -d/);
  assert.match(readme, /APP_PASSWORD/);
  assert.match(readme, /\/data\/backups/);
});
