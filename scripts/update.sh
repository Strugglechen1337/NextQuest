#!/usr/bin/env bash
# NextQuest-Updater
#
# Holt den neuesten Stand von GitHub, sichert die Datenbank, baut den Container neu
# und prüft, ob die App danach läuft. Schlägt das fehl, wird automatisch auf die
# vorherige Version zurückgerollt.
#
# Aufruf:
#   scripts/update.sh            Update, falls eine neue Version da ist
#   scripts/update.sh --check    Nur prüfen (Exit 0 = aktuell, Exit 10 = Update verfügbar)
#   scripts/update.sh --force    Neu bauen, auch wenn nichts Neues da ist
#
# Die letzte Ausgabezeile ist immer maschinenlesbar, z. B.:
#   NEXTQUEST_UPDATE status=updated from=abc1234 to=def5678
# status: up-to-date | available | updated | rolled-back | failed
#
# Exit-Codes: 0 = ok / aktuell / aktualisiert, 10 = Update verfügbar (--check),
#             1 = fehlgeschlagen (ggf. zurückgerollt), 2 = Aufruffehler

set -uo pipefail

BRANCH="${NEXTQUEST_BRANCH:-main}"
SERVICE="nextquest"
HEALTH_TIMEOUT="${NEXTQUEST_HEALTH_TIMEOUT:-120}"
KEEP_BACKUPS="${NEXTQUEST_KEEP_BACKUPS:-5}"

MODE="update"
case "${1:-}" in
  "") ;;
  --check) MODE="check" ;;
  --force) MODE="force" ;;
  -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
  *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.." || exit 2

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
result() { echo "NEXTQUEST_UPDATE status=$1 from=${FROM:-?} to=${TO:-?}${2:+ reason=\"$2\"}"; }

if ! command -v docker >/dev/null 2>&1; then
  log "Docker nicht gefunden."; result failed "docker missing"; exit 1
fi

# Nur ein Update gleichzeitig
LOCK=".update.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  log "Es läuft bereits ein Update ($LOCK)."; result failed "locked"; exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "Lokale Änderungen im Repo – Update abgebrochen. Bitte prüfen: git status"
  result failed "local changes"; exit 1
fi

log "Prüfe GitHub auf neue Version ($BRANCH)…"
if ! git fetch --quiet origin "$BRANCH"; then
  result failed "git fetch"; exit 1
fi

FROM="$(git rev-parse --short HEAD)"
TO="$(git rev-parse --short "origin/$BRANCH")"

if [ "$FROM" = "$TO" ] && [ "$MODE" != "force" ]; then
  log "NextQuest ist aktuell ($FROM)."
  result up-to-date; exit 0
fi

# Eine Version, die schon einmal zurückgerollt wurde, nicht bei jedem Lauf erneut versuchen
SKIP_FILE=".update-skip"
if [ "$MODE" = "update" ] && [ -f "$SKIP_FILE" ] && [ "$(cat "$SKIP_FILE")" = "$TO" ]; then
  log "Version $TO ist beim letzten Versuch fehlgeschlagen – übersprungen (mit --force erneut versuchen)."
  result failed "skipped known-bad version"; exit 1
fi

if [ "$MODE" = "check" ]; then
  log "Update verfügbar: $FROM → $TO"
  git --no-pager log --oneline "HEAD..origin/$BRANCH" | sed 's/^/  /'
  result available; exit 10
fi

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

deploy() {
  export GIT_COMMIT BUILT_AT
  GIT_COMMIT="$(git rev-parse --short HEAD)"
  BUILT_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  docker compose build "$SERVICE" && docker compose up -d "$SERVICE"
}

# 1) Datenbank sichern (falls der Container schon läuft)
if docker compose ps --status running --services 2>/dev/null | grep -qx "$SERVICE"; then
  STAMP="$(date '+%Y%m%d-%H%M%S')"
  mkdir -p backups
  if docker compose cp "$SERVICE:/data" "backups/data-$STAMP-$FROM" >/dev/null 2>&1; then
    log "Datenbank gesichert: backups/data-$STAMP-$FROM"
    # Nur die letzten $KEEP_BACKUPS Sicherungen behalten
    ls -1dt backups/data-* 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" | xargs -r rm -rf
  else
    log "Warnung: Sicherung fehlgeschlagen – fahre trotzdem fort."
  fi
fi

# 2) Neuen Stand holen
log "Aktualisiere $FROM → $TO…"
if ! git merge --ff-only --quiet "origin/$BRANCH"; then
  log "Fast-Forward nicht möglich (lokale Commits?)."; result failed "not fast-forward"; exit 1
fi

# 3) Bauen, starten, prüfen
if deploy && wait_healthy; then
  rm -f "$SKIP_FILE"
  log "Update erfolgreich – NextQuest läuft mit Version $TO."
  result updated; exit 0
fi

# 4) Rollback
log "Neue Version startet nicht – rolle zurück auf $FROM…"
echo "$TO" > "$SKIP_FILE"
git reset --hard --quiet "$FROM"
if deploy && wait_healthy; then
  log "Zurückgerollt auf $FROM. Bitte Logs prüfen: docker compose logs $SERVICE"
  result rolled-back "new version unhealthy"; exit 1
fi
log "Auch die vorherige Version startet nicht! Bitte manuell prüfen: docker compose logs $SERVICE"
result failed "rollback unhealthy"; exit 1
