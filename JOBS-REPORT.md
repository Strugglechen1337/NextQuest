# Hintergrund-Jobs und Automatik

Implementiert sind prozessweite Single-Flight-Jobs für `enrich`, `enrich-refresh`, `enrich-retry`, `descriptions` und `sync-all`, die API `/api/jobs`, der Minuten-Scheduler über `src/instrumentation.ts` und der deutsche Automatik-Abschnitt in der Einrichtung. Die bisherigen Client-Helfer starten Server-Jobs und fragen nur noch deren Fortschritt ab. Nach dem Schließen und erneuten Öffnen der Einrichtung ist der aktive Job im Automatik-Abschnitt sichtbar.

Neue Schlüssel in der bestehenden `settings`-Tabelle:

| Schlüssel | Bedeutung |
| --- | --- |
| `jobs.last` | JSON-Ergebnis des zuletzt beendeten Jobs, einschließlich Plattform-Ergebnissen und Fehlern |
| `auto.enabled` | `1`/`0`, ohne gespeicherten Wert eingeschaltet |
| `auto.time` | Server-Ortszeit `HH:MM`, Standard `04:00` |
| `auto.lastRun` | ISO-Zeitpunkt des zuletzt gestarteten automatischen Laufs |

`jobs.last` und `auto.lastRun` sind intern und über die Einstellungs-API nicht beschreibbar. Der Scheduler speichert den Start vor dem Starten des Jobs, holt mehrere versäumte Termine gemeinsam einmal nach und wartet bei einem aktiven manuellen Job bis zur nächsten Minutenprüfung. Vor dem ersten täglichen Termin ohne bisherigen Lauf wartet er auf den heutigen Termin. Nach einem Prozessabbruch kann ein Batch beim nächsten Lauf fortgesetzt werden; der letzte vollständig beendete Job bleibt sichtbar. Automatische Läufe werden bei Fehlern nicht jede Minute erneut gestartet.

`sync-all` ruft ausschließlich vorhandene Sync-Funktionen auf, für Steam/Xbox mit den gespeicherten erforderlichen Zugangsdaten, PlayStation/GOG/Epic mit Refresh-Token und Game Pass nur bei eingeschaltetem Abo. Plattformfehler werden einzeln gespeichert und stoppen nachfolgende Plattformen nicht. Auch bei einem IGDB-Fehler wird der unabhängige Beschreibungsschritt versucht. Ein Steam-429 beendet den Beschreibungsjob sauber mit dem Fortsetzungshinweis und respektiert den vorhandenen gespeicherten Cooldown.

Es gibt keine Änderungen an `src/lib/db.ts`, Plattform-Sync-Modulen, Vorschlags-/Session-/Genre-Logik, `deploy/`, Docker oder Abhängigkeiten. Neue Tabellen, Spalten oder Migrationen wurden nicht eingeführt. Der Next.js-Leitfaden zur Instrumentation sowie die Cache-Components-Einschränkung wurden berücksichtigt: dynamischer Node-Import in `register()`, Ausschluss von `phase-production-build`, keine unzulässige `runtime`-Segmentkonfiguration.

## Nachweise

- `npm install` erfolgreich, unter PowerShell über `npm.cmd` wegen der bestehenden Skript-Ausführungsrichtlinie.
- `npx tsc --noEmit`, `npx eslint src`, `npm run build`, `npm test` erfolgreich (Windows-Aufruf jeweils mit `.cmd`). Die Next.js-Routentypen wurden beim Build generiert; danach besteht auch der eigenständige TypeScript-Aufruf.
- 27 Tests bestanden. `tests/jobs.cjs` lädt die echten TS-Module und SQLite mit temporärem `DATA_DIR` und gemocktem `fetch`: Single-Flight mit blockiertem Netzwerk, Steam-Fehler und anschließender erfolgreicher Xbox-Sync, Ergebnis-Persistenz, Steam-429/Cooldown, deaktivierte/nicht fällige/fällige/nachgeholte Läufe, einmaliges Nachholen, belegter Runner und lokale Sommerzeit-Kalenderarithmetik. Ein Vergleich von `sqlite_master` vor und nach den Jobs weist das unveränderte Schema nach.
- Standalone-Prüfung: `node scripts/verify-jobs.cjs` startet tatsächlich `node .next/standalone/server.js`, lädt Demo-Daten in ein temporäres `DATA_DIR` und verwendet ausschließlich verzögerte Netzwerk-Fixtures. Die Start-Anfrage schließt ihren HTTP-Socket vollständig; zwei Sekunden ohne Clientverbindung später liefert eine neue Anfrage den weiterhin laufenden Beschreibungsjob. Nach insgesamt rund 8,5 Sekunden ist er mit 25 erledigten Spielen, null offenen Spielen und ohne Fehler beendet. Ein Neustart desselben Standalone-Servers zeigt dasselbe gespeicherte Ergebnis und die deaktivierte Automatik; ein weiterer Schema-Vergleich bleibt identisch. Der Prüfprozess und sein temporäres Datenverzeichnis werden anschließend entfernt.

Der optionale Hinweis auf der Bibliotheksseite wurde nicht ergänzt. Der vorgesehene Betrieb bleibt ein dauerhafter einzelner Node-Prozess; laufender Fortschritt wird im Speicher gehalten, abgeschlossene Ergebnisse in SQLite.
