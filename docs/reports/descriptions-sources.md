# Deutsche Kurzbeschreibungen: PlayStation und Wikipedia

## Umsetzung

Bestehender descriptions-Job: Steam → Microsoft → PlayStation → deutsche Wikipedia → vorhandener englischer Text. Keine neuen Jobs, npm-Abhängigkeiten oder Schemaänderungen. Bestehende deutsche Texte werden durch SELECT und bedingtes UPDATE geschützt. State-JSON enthält Fingerprint v2 (einschließlich PlayStation-IDs und Titel), Quelle und bei Wikipedia den Artikellink. Frühere erfolglose Fingerprints werden genau einmal erneut bearbeitet; unveränderte neue Fingerprints werden übersprungen.

PlayStation: öffentliche de-de-Konzeptseiten und vollständige Produkt-IDs, rekursiv durch eingebettete JSON-Skripte einschließlich Apollo-Beschreibungslisten mit LONG/SHORT und value. HTML wird mit descriptionText bereinigt, Texte auf höchstens 600 Zeichen möglichst am Satzende begrenzt. Timeout 15 Sekunden, mindestens eine Sekunde zwischen neuen Quellenanfragen, generischer User-Agent und Accept-Language de-DE. Fehler oder unbekannte Strukturen führen still zu Wikipedia.

Wikipedia: bekannte IGDB-Websites werden bevorzugt; fremdsprachige Wikipedia-Links werden über das Wikidata-Objekt aufgelöst. Sonst Wikidata-Titelsuche, P31=Q7889 und deutscher Sitelink, anschließend vorsichtige Wikipedia-Suche (Titel + Computerspiel) und exakter Titelabruf. Vor Übernahme werden Titelgleichheit, Spielbezug im Einleitungstext sowie gegebenenfalls deutscher Sprach-/Artikelnamensraum geprüft; Begriffsklärungen und offensichtliche andere Medien werden abgelehnt. Detailansicht zeigt Quelle: Wikipedia mit Artikellink, CC BY-SA 4.0 und Kürzungshinweis. Zusammenführen übernimmt die Herkunft passend zum beibehaltenen deutschen Text.

## Live-Probe ohne Zugangsdaten (7. November 2026)

Mit echtem Node-fetch, ohne Cookies oder Zugangsdaten, öffentliche de-de-Seiten und Summary-API. Auszüge bewusst kurz gehalten.

| Titel | URL | Ergebnis |
|---|---|---|
| God of War Ragnarök | https://store.playstation.com/de-de/concept/10001850 | HTTP 200; 497 Zeichen; „Santa Monica Studio präsentiert die Fortsetzung …“ |
| Marvel's Spider-Man 2 | https://store.playstation.com/de-de/concept/10002456 | HTTP 200; 569 Zeichen; „Die Edition enthält: Vollversion …“ |
| Astro Bot | https://store.playstation.com/de-de/concept/10002684 | HTTP 200; 431 Zeichen; „BEGLEITE ASTRO AUF EIN RIESIGES WELTRAUMABENTEUER …“ |
| Super Mario Odyssey | https://de.wikipedia.org/api/rest_v1/page/summary/Super_Mario_Odyssey | HTTP 200; deutscher Text übernommen; „Super Mario Odyssey ist ein Jump-’n’-Run-Action-Adventure-Videospiel …“ |
| The Legend of Zelda: Breath of the Wild | https://de.wikipedia.org/api/rest_v1/page/summary/The_Legend_of_Zelda%3A_Breath_of_the_Wild | HTTP 200; deutscher Text übernommen; „The Legend of Zelda: Breath of the Wild ist ein Open-World-Videospiel …“ |
| Animal Crossing: New Horizons | https://de.wikipedia.org/api/rest_v1/page/summary/Animal_Crossing%3A_New_Horizons | HTTP 200; deutscher Text übernommen; „Animal Crossing: New Horizons ist eine Lebenssimulation …“ |

Variantenprüfung: GraphQL op mit operationName=metGetConceptById und conceptId=10002684, ohne persistierten Hash, lieferte HTTP 400 mit „Query not whitelisted“. Kein belastbarer persistierter Hash wurde nachgewiesen; daher werden die direkt erreichbaren JSON-Seiten verwendet, ohne eine private GraphQL-Abfrage zu erfinden. Concept-IDs wurden über die öffentlichen Store-Suchergebnisse ermittelt und anschließend direkt abgerufen.

Bewusste Grenzen: nackte PPSA/CUSA-Title-IDs sind keine regionalen Produkt-SKUs. Die öffentliche Store-Suche nach PPSA08338_00 lieferte HTTP 200, aber keine passende Produkt-/Concept-Zuordnung; solche Einträge nutzen die Wikipedia-Titelsuche statt erfundener Store-IDs. Mario Kart 8 Deluxe wurde zusätzlich geprüft: die Summary leitet auf Mario Kart 8 weiter und beschreibt ausschließlich die Wii-U-Fassung; daher wird dieser Treffer konservativ abgelehnt. Die drei erfolgreichen Switch-Proben verwenden deshalb Super Mario Odyssey, Zelda und Animal Crossing. Wikimedia lieferte bei zusätzlichen schnellen Diagnoseanfragen teilweise HTTP 429; die neuen Quellen brechen den Job bei solchen Fehlern nicht ab.

## Prüfung und Datenrisiken

- npm install erfolgreich (Windows: npm.cmd wegen PowerShell-ExecutionPolicy).
- npx tsc --noEmit erfolgreich nach einmaligem next typegen für die lokalen generierten Routentypen.
- npm run lint: gesamtes Repository, keine Fehler.
- npm run build: erfolgreich.
- npm test: alle 32 Tests bestanden.
- tests/descriptions.cjs: rekursiver PlayStation-Text, unbekannte Struktur → Wikipedia, Nichtspiel abgewiesen, bestehender deutscher Text geschützt, alter Fingerprint einmalig erneut versucht, identisches sqlite_master vor/nach, Herkunft beim Zusammenführen erhalten.
- src/lib/db.ts, Plattform-Sync-Dateien, Jobs/Scheduler und deploy unverändert. Keine neue DELETE-/DDL-Anweisung; nur vorhandene summary_de-/summary_de_state-Felder beschrieben. Bestehende Löschlogik beim manuellen Zusammenführen unverändert.
- Keine produktive Datenbank geöffnet; Tests ausschließlich mit temporärer SQLite-Fixture.

Kein Push, kein Merge.
