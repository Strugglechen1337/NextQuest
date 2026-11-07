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

## Im Heimnetz bereitstellen (Docker)

Voraussetzung: Docker mit Compose-Plugin und Lesezugriff auf dieses private Repo
(z. B. per **Deploy-Key**: GitHub → Repo → Settings → Deploy keys).

```bash
git clone git@github.com:Strugglechen1337/NextQuest.git
cd NextQuest
cp .env.example .env        # Port / optionales Passwort anpassen
docker compose up -d --build
```

Danach im Browser `http://<server-ip>:3000` öffnen und unter **Einrichtung** die Zugänge eintragen.

**Update (automatisch, mit Sicherung und Rollback):**

```bash
scripts/update.sh           # Update einspielen, falls vorhanden
scripts/update.sh --check   # nur prüfen
```

Details für den Hermes-Bot (Exit-Codes, maschinenlesbare Ausgabe, Cron, Wiederherstellung): [docs/HERMES.md](docs/HERMES.md)

**Wichtig:**
- Alle Daten (Bibliothek, Zugangsdaten) liegen im Docker-Volume `nextquest-data` und bleiben bei Updates erhalten.
- `APP_PASSWORD` in `.env` setzt einen Passwortschutz (Benutzername beliebig). Empfohlen, sobald andere Geräte im Netz sind.
- Die App ist nicht für den Betrieb im öffentlichen Internet gedacht.
- Healthcheck-Endpunkt: `GET /api/health`

## Entwicklung

```bash
npm install
npm run dev     # http://localhost:3000
```

Daten landen lokal in `./data/nextquest.db` (in `.gitignore`).

Tech-Stack: Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · SQLite über das in Node 22 eingebaute `node:sqlite`.

> Persönliches Projekt. Einige Plattform-Schnittstellen sind inoffiziell und nur für den privaten Gebrauch gedacht.
