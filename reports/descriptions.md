# Deutsche Beschreibungen – Live-Probe

2026-11-07T10:10:27.761Z

Ohne Zugangsdaten, direkte öffentliche Store-APIs; Texte auf 220 Zeichen gekürzt.

- Steam 292030: HTTP 200; The Witcher 3: Wild Hunt — Remastered: The Witcher 3: Wild Hunt – Remastered modernisiert das gefeierte Rollenspiel mit einer Reihe von Upgrades und Optimierungen. Werde zum Monsterjäger, Geralt von Riva, und bereise eine düstere Fantasy-Open-World auf der Su
- Steam 1145360: HTTP 200; Hades: Trotze dem Totengott und kämpf dich in diesem spektakulären Rogue-like von den Machern von Bastion, Transistor und Pyre durch die Dungeons der Unterwelt.
- Steam 413150: HTTP 200; Stardew Valley: Dein Großvater hat dir sein altes Farmgrundstück in Stardew Valley hinterlassen. Ausgestattet mit Werkzeugen, die ihre besten Tage hinter sich haben, und ein paar Münzen beginnst du ein neues Leben. Kannst du von dem leb
- Game Pass 9NPDN9R45JX4: HTTP 200; 1000xRESIST: Im spannenden Science-Fiction-Abenteuer 1000xRESIST sorgt eine von außerirdischen Angreifern verbreitete Krankheit dafür, dass du unter der Erde lebst. Als Betrachterin dienst du der ALLMUTTER, bis du ein schockierendes
- Game Pass 9P8LR42PTRGJ: HTTP 200; 33 Immortals: 33 Immortals ist ein Koop-Action-Roguelike für 33 Spieler. Stürze dich im Nu in den Durchlauf, allein oder mit Freunden. Bekämpfe Horden von Monstern, besiege riesige Bosse und werde mit jedem Durchlauf stärker. Nutze Em
- Game Pass 9NNM7PKZN3JF: HTTP 200; 9 Kings (Spielvorschau): Ein rasanter Roguelike-Kingdom-Builder. Baue dein Königreich auf und schlage riesige Schlachten. Verschiebe das Spielgleichgewicht mit tausenden irren Builds und werde König der Könige.

## Umsetzung und Datenbank

- Neue nullable Spalte `games.summary_de TEXT`, ohne Default, Index oder Constraint.
- Neue nullable Spalte `games.summary_de_state TEXT`, ohne Default, Index oder Constraint. Enthält den JSON-Prüfstand der verfügbaren Steam-/Microsoft-IDs und IGDB-Zuordnung; neue Quellen machen fehlende Texte erneut prüfbar.
- Beide Spalten werden ausschließlich bei Fehlen via `PRAGMA table_info(games)` und `ALTER TABLE games ADD COLUMN … TEXT` angelegt. Die Migration schreibt keine bestehenden Zeilen um und löscht nichts. Vorhandene Migrationen für `keywords` und `session_pref` bleiben unverändert.
- Neuer interner Schlüssel `descriptions.steamRetryAt` in der bestehenden Tabelle `settings`: wird erst bei HTTP 429 geschrieben, übersteht Serverneustarts und berücksichtigt `Retry-After` mit mindestens fünf Minuten Pause. Keine weitere Schemaänderung.
- Höchstens 25 Spiele pro Sync-Aufruf; einzelne Steam-Anfragen mit mindestens 1600 ms Abstand, Microsoft-Anfragen mit höchstens 100 Produkt-IDs. Gleichzeitige Aufrufe im selben Server teilen einen laufenden Stapel.
- Steam-AppIDs stammen aus Besitz-Einträgen oder der inversen IGDB-Zuordnung. Microsoft-IDs stammen aus Game-Pass-Einträgen; Xbox speichert lediglich numerische Title-IDs und liefert im bestehenden verarbeiteten Modell keine Product-ID, daher kein zusätzlicher Xbox-Abruf.
- Englische Beschreibungen werden nie überschrieben. Erfolgreiche deutsche Texte bleiben bei Merge erhalten; leere Ziele übernehmen den Quelltext. Die Oberfläche bietet den Ladevorgang auch ohne IGDB-Zugang für direkte Store-IDs an.
- Kein automatischer Nachladevorgang nach Plattform-Importen; erneuter manueller Aufruf prüft neue Quellen. Plattform-Sync, Vorschläge, Sessions, Library, Docker und Deployment bleiben unverändert. Keine npm-Abhängigkeit ergänzt.

## Verifikation

`npm install` abgeschlossen. Next.js-Routenreferenz unter `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` vor der Umsetzung gelesen.

- `npx tsc --noEmit`: erfolgreich, nach initialem `next typegen` für die generierten Next.js-Typen.
- `npx eslint src`: erfolgreich.
- `npm run build`: erfolgreich, Next.js 16.4.5 / Turbopack.
- `npm test`: erfolgreich, 24 Tests, keine Fehler.
- Neue Fetch-Mocks prüfen Steam-Persistenz/HTML-Dekodierung, unveränderten englischen Text, Cache, 429-Abbruch/Cooldown/Fortsetzung, inverse IGDB-Zuordnung, Microsoft-Sammelabruf/Langtextkürzung, erneute Prüfung nach neuer Quelle und Merge-Erhalt.
- Der erweiterte Migrationstest vergleicht sämtliche ursprünglichen Spaltenwerte in `games`, `ownerships` und `settings`, einschließlich Beschreibung, IGDB-ID, Genre, Bewertung, Abschlussstatus, Spielzeit und Einstellung; zweites Öffnen prüft Idempotenz, außerdem Rollback und SQLite `quick_check`.
- Alle sechs oben dokumentierten Live-Abfragen waren HTTP 200 und enthielten deutschen Text. Die Game-Pass-IDs stammen aus dem öffentlichen aktuellen PC-Katalog, ohne gespeicherte Zugangsdaten oder Zugriff auf eine produktive Datenbank.
