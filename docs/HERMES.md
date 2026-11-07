# NextQuest – Anleitung für den Hermes-Bot

Diese Datei beschreibt, wie ein Automatisierungs-Bot (Hermes) NextQuest im Heimnetz installiert und aktuell hält.

## Erstinstallation

```bash
git clone https://github.com/Strugglechen1337/NextQuest.git nextquest   # privates Repo – GitHub-Zugang nötig
cd nextquest
cp .env.example .env            # NEXTQUEST_PORT / APP_PASSWORD bei Bedarf setzen
chmod +x scripts/update.sh
scripts/update.sh --force       # baut, startet und prüft die App
```

Danach ist die App unter `http://<server-ip>:<NEXTQUEST_PORT>` erreichbar (Standard 3000).
Zugangsdaten für Steam, IGDB usw. werden **in der App** unter „Einrichtung“ eingetragen – nicht in `.env`.

## Aktualisieren

| Befehl | Wirkung | Exit-Code |
|---|---|---|
| `scripts/update.sh --check` | Nur prüfen, ob auf GitHub eine neue Version liegt | `0` aktuell, `10` Update verfügbar |
| `scripts/update.sh` | Update einspielen, falls vorhanden | `0` ok, `1` fehlgeschlagen |
| `scripts/update.sh --force` | Neu bauen, auch ohne neue Version | `0` ok, `1` fehlgeschlagen |

Ablauf eines Updates:
1. `git fetch` – gibt es einen neuen Commit auf `main`?
2. Sicherung der Datenbank nach `backups/data-<zeit>-<commit>` (die letzten 5 bleiben)
3. `git merge --ff-only`, `docker compose build`, `docker compose up -d`
4. Gesundheitscheck (`/api/health`, bis zu 120 s)
5. Schlägt der Check fehl → automatischer **Rollback** auf die vorherige Version. Die kaputte Version wird gemerkt und beim nächsten Lauf übersprungen (bis eine neuere kommt oder `--force`).

Die **letzte Zeile** der Ausgabe ist maschinenlesbar:

```
NEXTQUEST_UPDATE status=<up-to-date|available|updated|rolled-back|failed> from=<commit> to=<commit> [reason="…"]
```

Empfehlung für Hermes: z. B. alle 6 Stunden `scripts/update.sh` ausführen und nur bei `updated`, `rolled-back` oder `failed` eine Nachricht schicken.

Alternativ per Cron:

```cron
0 */6 * * * cd /pfad/zu/nextquest && scripts/update.sh >> update.log 2>&1
```

## Nützliche Endpunkte

- `GET /api/health` → `{"ok":true}` wenn App und Datenbank laufen
- `GET /api/version` → `{"version":"0.1.0","commit":"abc1234","builtAt":"…"}` – laufende Version

`/api/health` ist immer ohne Passwort erreichbar. Ist `APP_PASSWORD` gesetzt, braucht `/api/version`
Basic-Auth (`curl -u x:<passwort> …`).

## Wiederherstellen einer Sicherung

```bash
docker compose stop nextquest
docker compose cp backups/data-<zeit>-<commit>/. nextquest:/data/
docker compose start nextquest
```

## Konfiguration des Updaters (optional, Umgebungsvariablen)

| Variable | Standard | Bedeutung |
|---|---|---|
| `NEXTQUEST_BRANCH` | `main` | Branch, dem gefolgt wird |
| `NEXTQUEST_HEALTH_TIMEOUT` | `120` | Sekunden bis zum Rollback |
| `NEXTQUEST_KEEP_BACKUPS` | `5` | Anzahl aufbewahrter Sicherungen |
