# PlayStation-Anbindung

Implementiert in `src/lib/playstation.ts` und `src/components/setup/PlayStationStep.tsx`; minimale Integration in Settings, Setup sowie Test-/Sync-Routen. Keine neue npm-Abhängigkeit: die direkten Sony-Endpunkte wurden mit dem installierten Quellcode von psn-api verglichen (das Paket wurde anschließend wieder entfernt; package.json und Lockfile bleiben unverändert).

## Anmeldung und Daten

- `POST /api/test/playstation` nimmt `{ npsso }` entgegen, validiert den 64-stelligen Code, tauscht ihn gegen Access-Code und Access-/Refresh-Token und prüft die komplette Spieleliste vor dem Speichern. NPSSO wird niemals gespeichert.
- Tokens und Ablaufzeiten liegen in SQLite. Beide Tokens sind als geheim markiert; Tokens und Access-Ablaufzeit werden aus öffentlichen Settings vollständig ausgelassen. Refresh-Ablaufzeit und optionale Online-ID stehen der Einrichtung zur Verfügung.
- Access-Tokens werden vor Ablauf und nach einer 401-Antwort automatisch erneuert; gleichzeitige Refresh-Versuche teilen sich eine Promise. Abgelaufene Refresh-Tokens erzeugen eine deutsche Aufforderung zur erneuten NPSSO-Eingabe.
- `POST /api/sync/playstation` lädt paginiert bis zu 10.000 Titel; bei unvollständigen oder fehlerhaften Antworten wird vor dem Schreiben abgebrochen. Upsert und Prune laufen gemeinsam in einer Transaktion.
- PS4/PS5-Versionen mit gleicher Concept-ID erhalten `concept:<id>` als externalId, damit eine Plattform nicht zweimal dasselbe Spiel enthält. Spielzeiten werden addiert, das jüngste Spieldatum gewinnt, Titel/Cover bevorzugen PS5. Ohne Concept-ID wird titleId verwendet.
- ISO-8601-Dauern werden auf ganze Minuten gerundet; Titel, Cover und letztes Spieldatum werden übernommen. Disconnect löscht Settings und PlayStation-Besitzdaten.
- Der deutsche Guide enthält direkte Login-/Cookie-Links, Hinweise auf etwa zwei Monate Gültigkeit und die Einschränkung auf bereits gestartete PS4/PS5-Spiele. Einrichtung importiert direkt und ruft bei konfiguriertem IGDB `runEnrich` auf.

## Nachweis

- `npm.cmd install` erfolgreich (PowerShell blockiert npm.ps1, deshalb die äquivalente .cmd-Datei).
- `npx.cmd tsc --noEmit`, `npx.cmd eslint src` und `npm.cmd run build` erfolgreich. Beim allerersten TypeScript-Lauf fehlten frisch generierte Next.js-Routentypen; nach dem Build waren auch die wiederholten TypeScript-Prüfungen erfolgreich.
- Dev-Server auf Port 3217 mit eigenem temporärem DATA_DIR gestartet. `POST /api/test/playstation` mit `falsch` ergibt HTTP 400: „Das sieht nicht wie ein NPSSO-Code aus. Er besteht aus genau 64 Buchstaben und Ziffern – kopiere nur den Wert hinter „npsso“ (ohne Anführungszeichen).“
- Derselbe Endpunkt mit 64-mal `x` erreicht Sony und ergibt HTTP 400: „Sony hat den NPSSO-Code abgelehnt. Er ist falsch oder abgelaufen – melde dich auf playstation.com neu an und hole einen frischen Code.“
- Öffentliche Settings geprüft: keine Token-Felder enthalten.
- Isolierter Test der tatsächlichen TypeScript-Modulimplementierung mit simulierten Sony-/DB-Antworten erfolgreich: Dauer, NPSSO-Validierung, Login, zwei Seiten Pagination, Concept-Zusammenfassung, Upsert/Prune, Refresh, Abbruch bei defekter Spieleliste, Refresh-Ablauf, Disconnect. Ein erster Testvergleich scheiterte an der PowerShell-Zeichencodierung des Testausdrucks; der korrigierte Test lief vollständig erfolgreich.

## Grenzen

Keine echten Zugangsdaten vorhanden: erfolgreicher Sony-Login, echte Spielzeiten/Cover, reale Token-Rotation und UI im Browser sind nicht live verifiziert. Gekaufte, nie gestartete Spiele werden bewusst nicht zusätzlich importiert: der ergänzende GraphQL-Kaufkatalog mit veränderlichen Abfrage-Hashes ist für diese Anbindung nicht stabil genug; PS Plus/Free-to-play können in der gestarteten Spieleliste enthalten sein, die kein reiner Kaufnachweis ist. Inoffizielle Sony-Endpunkte können sich ändern; Profile sind optional und ein Fehler bei der Online-ID verhindert keinen Spieleimport.
