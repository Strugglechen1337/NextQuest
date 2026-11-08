## Ausprobieren

[NextQuest online ausprobieren](https://strugglechen1337.github.io/NextQuest/) ? ohne Installation.

# NextQuest

Deine gesamte Spielesammlung an einem Ort – und die Antwort auf die Frage: **„Was spiele ich als Nächstes?“**

## Funktionen

- **Sammlungsübersicht:** alle Spiele aller Plattformen in einer Bibliothek, mit Cover
- **Mehrfachbesitz:** Ein Spiel, das du mehrfach hast, erscheint nur einmal – mit Badge (`×2`) und Plattform-Icons. Filter „Nur doppelte“. Falsche Zuordnungen lassen sich im Spiel-Dialog abtrennen oder neu zuordnen
- **Filtern & Sortieren:** nach eigener Spielzeit, Spieldauer, Beliebtheit, Bewertung, Plattform, Game Pass
- **⏱️ „Ich habe X Minuten“:** passende Vorschläge mit Begründung (kurz durchspielbar, fast fertig, gut für kurze Runden …)
- **🎲 Zufallsspiel** aus deinen offenen Spielen
- **✅ Abhaken:** durchgespielte Spiele bleiben in der Sammlung, tauchen aber nicht mehr in Vorschlägen auf
- **Einrichtungsassistent** in der App – Zugangsdaten werden dort eingetragen, getestet und lokal gespeichert
- **Demo-Daten** zum Ausprobieren ohne Zugänge

## Plattformen

| Plattform | Status |
|---|---|
| Steam | ✅ Spiele + Spielzeit (API-Key) |
| Xbox Game Pass | ✅ öffentlicher Katalog (PC + Konsole), kein Zugang nötig |
| IGDB | ✅ Cover, Spieldauer, Bewertung, Beliebtheit (kostenloser Twitch-Zugang) |
| Switch, Ubisoft | ✍️ manuell hinzufügen |
| Xbox-Käufe, PlayStation | 🔜 Ausbaustufe 2 |
| GOG, Epic | 🔜 Ausbaustufe 3 |

## Docker

Für NAS, Raspberry Pi und Heimserver steht ein fertiges Multi-Arch-Image (`linux/amd64` + `linux/arm64`) in der GitHub Container Registry bereit – ohne Klonen oder eigenes Bauen in **3 Zeilen bis zum Start**:

```bash
mkdir nextquest && cd nextquest
curl -fsSLO https://raw.githubusercontent.com/Strugglechen1337/NextQuest/main/docker-compose.yml
docker compose up -d
```

Danach im Browser `http://<server-ip>:3000` öffnen und unter **Einrichtung** die gewünschten Plattformen verbinden.

- **Datenordner (`/data`):** Alle Daten (SQLite-Datenbank `nextquest.db`, Plattform-Zugangsdaten, Einstellungen und Backups) liegen im Container unter `/data` – in `docker-compose.yml` als Volume `nextquest-data:/data` eingebunden – und bleiben bei Updates erhalten.
- **Passwort (`APP_PASSWORD`):** Optionaler Zugriffsschutz fürs Heimnetz per Umgebungsvariable `APP_PASSWORD` (z. B. über eine `.env`-Datei neben `docker-compose.yml`, siehe [`.env.example`](.env.example); Port über `NEXTQUEST_PORT`, Zeitzone `TZ=Europe/Berlin`). Der Browser fragt dann nach Passwort (Benutzername beliebig). `GET /api/health` bleibt für den Container-Healthcheck frei.
- **Updates:** Neues Image laden und Container neu starten:
  ```bash
  docker compose pull && docker compose up -d
  ```
  Für vollautomatische Updates kann in [`docker-compose.yml`](docker-compose.yml) der vorbereitete **Watchtower**-Block einkommentiert werden.
- **Sicherung (`/data/backups`):** NextQuest sichert die Datenbank selbstständig nach `/data/backups` (innerhalb des `/data`-Volumes) und bietet Sicherung sowie Wiederherstellung direkt in der App an. Für ein externes Host-Backup genügt es, das Volume bzw. `/data/backups` wegzusichern.
- Weitere Hinweise zum Betrieb: [docs/HERMES.md](docs/HERMES.md) (Docker) bzw. [deploy/README.md](deploy/README.md) (native Linux-Server-Variante).

## Entwicklung

```bash
npm install
npm run dev     # http://localhost:3000
```

Daten landen lokal in `./data/nextquest.db` (in `.gitignore`).

Tech-Stack: Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · SQLite über das in Node 22 eingebaute `node:sqlite`.

> Persönliches Projekt. Einige Plattform-Schnittstellen sind inoffiziell und nur für den privaten Gebrauch gedacht.

## Windows-App

Das Setup `NextQuest-Setup-<Version>.exe` steht in den [GitHub-Releases](https://github.com/Strugglechen1337/NextQuest/releases) bereit. Das Setup ist nicht signiert; Windows SmartScreen kann deshalb warnen. Über „Weitere Informationen“ und „Trotzdem ausführen“ lässt sich die Installation fortsetzen.

Beim ersten Start kann der Datenordner gewählt werden; standardmäßig liegt er unter `%LOCALAPPDATA%\NextQuest\data`. Wenn Windows nach Netzwerkzugriff fragt, privates Netzwerk erlauben. Die App bleibt beim Schließen des Fensters im Infobereich aktiv und kann so die geplanten Aufgaben ausführen.

Im Infobereich „Auf dem Handy öffnen“ wählen und den QR-Code mit einem Handy im selben WLAN scannen. Dort stehen auch Adresse und Passwort; der Benutzername ist beliebig. Im Handy-Browser kann NextQuest zum Startbildschirm hinzugefügt werden. Die Verbindung im Heimnetz ist nicht verschlüsselt.

Updates werden über GitHub Releases angeboten und vor der Installation wird eine Sicherung erstellt. Die Deinstallation entfernt die Anwendung, behält aber den Datenordner; diesen bei Bedarf selbst löschen.
