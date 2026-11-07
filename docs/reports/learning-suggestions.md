# Lernende Zeit-Vorschläge – Nachweis

## Verhalten

- Zentraler Anschluss in `upsertOwnership`, ohne Änderungen an Plattform-Syncs oder Prune-Verhalten. Vorhandene Zähler werden vor dem ersten Update als Ausgangspunkt erfasst, danach nur geänderte Summen je Spiel/Plattform.
- Median aus mindestens drei positiven Zuwächsen bis einschließlich 480 Minuten; Plattformen werden getrennt differenziert. Unveränderte Zähler, Rücksetzungen und größere Zuwächse zählen nicht. Sync-Zuwächse sind eine Schätzung und können mehrere reale Sessions enthalten.
- Manuelle Session-Vorgaben haben Vorrang. Gelernte Dauer liefert eine Begründung und bei passender verfügbarer Zeit einen zusätzlichen Bonus.
- Feedback je Spiel und Zeitklasse: kurz bis 45 Minuten, mittel bis 120 Minuten, sonst lang. Negative Bewertung: −60 Punkte; positive Bewertung: +10 Punkte. Keine dauerhafte Ausblendung. Negative Bewertung ersetzt die betreffende Karte unmittelbar durch den nächsten noch nicht sichtbaren Kandidaten; ohne weiteren Kandidaten entfällt sie.
- Feedback ist in der Spielansicht sichtbar und vollständig zurücksetzbar. Feedback und Tags werden beim bestehenden Zusammenführen von Spielen übernommen; Schnappschüsse werden verschoben.
- SteamSpy wird additiv nach `descriptions` und `sync-all` geladen. Eigene Steam-AppID, sonst IGDB→Steam; maximal 100 Spiele pro Lauf, mindestens 1100 ms zwischen Anfragen, 15 Sekunden Timeout, Fehler toleriert. Erfolge werden nach 30 Tagen, fehlende/fehlerhafte Ergebnisse nach einem Tag erneut geprüft.
- Bis zu 30 Tags mit Stimmen; nur mindestens 10 % der höchsten Stimmenzahl zählen in der Klassifizierung. Kurze starke Signale wie Roguelike/PvP haben Vorrang vor langen Tags wie RPG.

## Exakte Schema-Ergänzungen

Alle Definitionen liegen idempotent als `CREATE TABLE/INDEX IF NOT EXISTS` in `src/lib/db.ts`. Keine bestehenden Spalten, Tabellen oder Einstellungen werden migriert, umbenannt oder gelöscht.

1. `playtime_snapshots`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE`, `platform TEXT NOT NULL`, `taken_at TEXT NOT NULL DEFAULT (datetime('now'))`, `playtime_min INTEGER NOT NULL`.
2. Index `snapshots_game_platform` auf `playtime_snapshots(game_id, platform, id)`.
3. `suggestion_feedback`: `game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE`, `time_class TEXT NOT NULL CHECK(time_class IN ('short','medium','long'))`, `value INTEGER NOT NULL CHECK(value IN (-1,1))`, Primärschlüssel `(game_id,time_class)`.
4. `steam_tags`: `game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE`, `name TEXT NOT NULL`, `votes INTEGER NOT NULL`, Primärschlüssel `(game_id,name)`.
5. `steam_tag_checks`: `game_id INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE`, `checked_at TEXT NOT NULL`, `retry_at TEXT NOT NULL`, `app_id TEXT`.

Neue `settings`-Schlüssel: **keine**. Keine zusätzlichen npm-Abhängigkeiten. Keine Aufbewahrungs-Löschung implementiert; Schnappschüsse bleiben erhalten.

## Pflichtprüfungen

Ausgeführt im Worktree `<REPO>\nq-learn`, schwere Prüfungen nacheinander:

- `npm install` / nach Reparatur der zunächst unvollständigen Installation `npm ci --no-audit --no-fund`: erfolgreich.
- Relevante Next.js-16.4.5-Dokumentation zu Route Handlers und Server/Client Components gelesen.
- `npx next typegen`, anschließend `npx tsc --noEmit`: Exit 0.
- `npm run lint`: Exit 0, keine Fehler/Warnungen.
- `npm run build`: Exit 0, einschließlich neuer Feedback-Route.
- `npm test`: 33 Tests bestanden, 0 fehlgeschlagen.
- `git diff --check`: sauber.

`tests/session-learning.cjs` prüft Median, Mindestanzahl, gerade/ungerade Datenmenge, Ausreißer, unveränderte Zähler/Rücksetzungen, Zeitklassengrenzen, Hades/Witcher 3/CoD, manuelle Priorität, Feedback-Gewichte und Persistenz, gedrosselte SteamSpy-Abfragen und Fehlertoleranz. `tests/migration.cjs` startet ausdrücklich ohne die neuen Tabellen, prüft erhaltene Bestandsdaten einschließlich Zugangsdaten/Spielzeiten, zweimaliges Öffnen, Transaktions-Rollback und SQLite `quick_check`.

## UI-Nachweis

Temp-Datenbank: `<TEMP>\nq-learn-qa-20261107\data`, befüllt durch `POST /api/demo` (25 Spiele). Keine Produktionsdaten verwendet. Server auf Port 3217 und gestarteter Headless-Edge-Prozess nach Prüfung beendet.

Headless Edge mit `--headless=new --disable-gpu --hide-scrollbars --window-size=390,844` bzw. `1440,900`, `--virtual-time-budget=10000 --screenshot=...`; anschließend interaktive Prüfung über CDP mit exakter Viewport-Emulation (Edge begrenzt die native Fenster-Mindestbreite).

Visuell geprüfte maßgebliche Screenshots:

- `<TEMP>\nq-learn-qa-20261107\mobile-suggestions.png` (390×844, ohne horizontalen Überlauf).
- `<TEMP>\nq-learn-qa-20261107\desktop-suggestions.png` (1440×900).
- `<TEMP>\nq-learn-qa-20261107\desktop-detail-feedback.png` (1440×900).

Zusätzlich: `mobile-baseline.png`, `desktop-baseline.png`, ausführbares `ui-qa.cjs` und `ui-results.json` im selben Temp-Ordner. Interaktionstest prüft sofortigen Ersatz nach 👎, gespeichertes 👍/👎 über `/api/library`, Feedback-Anzeige im Dialog und gespeicherte Rücksetzung.

Offen: unabhängige Betriebsprüfung und Integration durch den Koordinator; kein Push und kein Merge durchgeführt.
