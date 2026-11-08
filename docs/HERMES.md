# NextQuest – Betrieb & Updates (Docker vs. Linux-Server)

> **Hinweis zur Einordnung:**
> Diese Datei beschrieb in der ersten Version den alten Docker-Build-Updater (`scripts/update.sh`), der das Repository klonte und das Image bei jedem Update lokal neu baute.
>
> Inzwischen gibt es zwei klar getrennte Betriebsarten:
> 1. **Docker (NAS, Raspberry Pi, Heimserver):** Nutzt das fertige Multi-Arch-Image `ghcr.io/strugglechen1337/nextquest:latest` (`linux/amd64` + `linux/arm64`). Es ist kein Git-Klon und kein lokaler Build nötig.
> 2. **Native Linux-Server-Variante (ohne Docker):** Nutzt die systemd-Dienste, den In-App-Updater (`deploy/update.py`), Online-Backups (`deploy/backup.py`) und das Monitoring (`deploy/monitor.py`) – dokumentiert in [`deploy/README.md`](../deploy/README.md).

---

## 1. Docker-Variante starten

Es wird lediglich die [`docker-compose.yml`](../docker-compose.yml) (und optional `.env` nach Vorlage von [`.env.example`](../.env.example)) benötigt:

```bash
mkdir nextquest && cd nextquest
curl -fsSLO https://raw.githubusercontent.com/Strugglechen1337/NextQuest/main/docker-compose.yml
docker compose up -d
```

Danach ist NextQuest unter `http://<server-ip>:3000` (bzw. `NEXTQUEST_PORT`) erreichbar.
Plattform-Zugangsdaten (Steam, IGDB, Xbox, PlayStation, GOG, Epic …) werden direkt **in der App** unter „Einrichtung“ hinterlegt.

## 2. Updates unter Docker

### Manuell (oder per einfachem Cronjob)

```bash
docker compose pull && docker compose up -d
```

### Automatisch per Watchtower

In [`docker-compose.yml`](../docker-compose.yml) ist ein optionaler `watchtower`-Dienst vorbereitet (auskommentiert). Wird er aktiviert, prüft Watchtower nachts automatisch auf ein neues Image von `ghcr.io/strugglechen1337/nextquest:latest`, tauscht den Container bei Bedarf aus und räumt das alte Image auf.

### Altes Skript `scripts/update.sh` (veraltet)

`scripts/update.sh` stammt aus der ersten Version und wird für Neuinstallationen **nicht mehr benötigt**. Falls ein bestehender Cronjob das Skript noch aufruft, baut es nicht mehr lokal aus Git, sondern führt `docker compose pull` + `docker compose up -d` inklusive Prüfung von `/api/health` aus und gibt weiterhin die Statuszeile `NEXTQUEST_UPDATE status=…` aus.

## 3. Datenhaltung & Sicherung unter Docker

- Alle persistenten Daten liegen im Container unter `/data` (in `docker-compose.yml` als Volume `nextquest-data:/data` eingebunden).
- NextQuest legt automatische und manuelle Datenbanksicherungen selbstständig im Unterordner **`/data/backups`** ab.
- Wiederherstellen: Container stoppen, gewünschte Sicherung aus `/data/backups` als `/data/nextquest.db` zurückkopieren, Container starten (eine Wiederherstellung per Knopf in der App gibt es noch nicht).

## 4. Nützliche Endpunkte

- `GET /api/health` → `{"ok":true}`, sobald App und SQLite-Datenbank bereit sind (auch bei gesetztem `APP_PASSWORD` ohne Anmeldung erreichbar, wird vom Docker-`HEALTHCHECK` genutzt).
- `GET /api/version` → `{"version":"0.1.0","commit":"abc1234","builtAt":"…"}` – laufende Version und Commit-Stand des Images. Ist `APP_PASSWORD` gesetzt, ist Basic-Auth nötig (`curl -u x:<passwort> …`).
