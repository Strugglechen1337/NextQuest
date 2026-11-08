#!/usr/bin/env bash
# NextQuest – Docker-Updater (VERALTET: stammt aus der ersten Version mit lokalem Build)
#
# HINWEIS:
# NextQuest stellt inzwischen ein fertiges Multi-Arch-Image bereit
# (ghcr.io/strugglechen1337/nextquest:latest für linux/amd64 und linux/arm64).
# Ein Git-Klon und lokales Bauen sind für Docker nicht mehr nötig.
#
# Standard-Update unter Docker:
#   docker compose pull && docker compose up -d
# oder automatisch über den in docker-compose.yml vorbereiteten Watchtower-Dienst.
# Die App sichert ihre Datenbank selbstständig nach /data/backups.
# (Die native Linux-Server-Variante ohne Docker nutzt stattdessen deploy/update.py.)
#
# Falls dieses Skript weiterhin von älteren Cronjobs oder Bots aufgerufen wird,
# zieht es nun das fertige Image per `docker compose pull`, startet den Container
# neu und prüft `/api/health`.
#
# Aufruf:
#   scripts/update.sh            Image aktualisieren, falls eine neue Version vorliegt
#   scripts/update.sh --check    Nur prüfen (Exit 0 = aktuell)
#   scripts/update.sh --force    Container auch ohne neues Image neu starten
#
# Letzte Ausgabezeile (maschinenlesbar):
#   NEXTQUEST_UPDATE status=<up-to-date|available|updated|rolled-back|failed> from=<id> to=<id>

set -uo pipefail

SERVICE="nextquest"
IMAGE="${NEXTQUEST_IMAGE:-ghcr.io/strugglechen1337/nextquest:latest}"
HEALTH_TIMEOUT="${NEXTQUEST_HEALTH_TIMEOUT:-120}"

MODE="update"
case "${1:-}" in
  "") ;;
  --check) MODE="check" ;;
  --force) MODE="force" ;;
  -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
  *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.." || exit 2

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
result() { echo "NEXTQUEST_UPDATE status=$1 from=${FROM:-?} to=${TO:-?}${2:+ reason=\"$2\"}"; }

if ! command -v docker >/dev/null 2>&1; then
  log "Docker nicht gefunden."; result failed "docker missing"; exit 1
fi

LOCK=".update.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  log "Es läuft bereits ein Update ($LOCK)."; result failed "locked"; exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

current_image_id() {
  docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null | sed 's/^sha256://' | cut -c1-12 || true
}

health() {
  docker compose exec -T "$SERVICE" node -e \
    "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1
}

wait_healthy() {
  local waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    if health; then return 0; fi
    sleep 3; waited=$((waited + 3))
  done
  return 1
}

FROM="$(current_image_id)"
[ -z "$FROM" ] && FROM="none"

log "Hinweis: scripts/update.sh ist veraltet. Empfohlen: 'docker compose pull && docker compose up -d' oder Watchtower."

if [ "$MODE" = "check" ]; then
  log "Prüfe Registry auf neues Image ($IMAGE)…"
  if ! docker compose pull --quiet "$SERVICE"; then
    result failed "docker pull"; exit 1
  fi
  TO="$(current_image_id)"
  [ -z "$TO" ] && TO="unknown"
  if [ "$FROM" = "$TO" ]; then
    log "Image ist aktuell ($FROM)."
    result up-to-date; exit 0
  fi
  log "Neues Image verfügbar: $FROM → $TO"
  result available; exit 10
fi

log "Lade aktuelles Image ($IMAGE)…"
if ! docker compose pull "$SERVICE"; then
  result failed "docker pull"; exit 1
fi

TO="$(current_image_id)"
[ -z "$TO" ] && TO="unknown"

if [ "$FROM" = "$TO" ] && [ "$MODE" != "force" ]; then
  log "NextQuest-Image ist bereits aktuell ($FROM)."
  result up-to-date; exit 0
fi

log "Starte Container neu ($FROM → $TO)…"
if docker compose up -d "$SERVICE" && wait_healthy; then
  log "Update erfolgreich – NextQuest läuft mit Image $TO."
  result updated; exit 0
fi

log "Container nach Update nicht gesund. Bitte Logs prüfen: docker compose logs $SERVICE"
result failed "unhealthy"; exit 1
