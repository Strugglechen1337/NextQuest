# Windows-Desktop-Build

Im Repository `npm ci` und `npm run build` ausführen, danach in `desktop` `npm ci` und `npm run dist`. Das Setup liegt in `desktop/dist`. Vor dem Build müssen Git und die Node-Version 22 oder neuer verfügbar sein. Electron 45 enthält Node 24 und startet den Standalone-Server über `ELECTRON_RUN_AS_NODE`; `node:sqlite` ist damit verfügbar. QR-Codes erzeugt die kleine Bibliothek `qrcode` lokal ohne externen Dienst.

Auf dem Entwickler-PC temporäre Daten und Caches vor jedem Befehl auf D: setzen:

```powershell
$env:TEMP='D:\Temp'; $env:TMP='D:\Temp'
$env:npm_config_cache='D:\DevCache\npm'
$env:ELECTRON_CACHE='D:\DevCache\electron'
$env:ELECTRON_BUILDER_CACHE='D:\DevCache\electron-builder'
```

Der Build kopiert Next Standalone inklusive `public` und `.next/static` nach `desktop/server` und generiert das Icon aus `src/app/icon.svg`. Diese Verzeichnisse und `dist` sind Build-Ausgaben. `npm test` in `desktop` prüft die Hilfsfunktionen.

Für automatisierte und verwaltete Installationen kann `NEXTQUEST_DATA_DIR` den Datenordner vorgeben und den Einrichtungsdialog überspringen. `--data-dir=<Pfad>` hat Vorrang vor der Umgebungsvariable. `NEXTQUEST_PASSWORD` setzt das Netzwerkpasswort für diesen Start; ohne diese Variable gilt weiterhin das gespeicherte oder zufällig erzeugte Passwort. Ein zweiter Start mit `--quit` beendet die laufende Instanz samt Server. `--screenshot=<Datei>` und `--qr-screenshot=<Datei>` speichern nach dem Laden Fensterbilder. Siehe [Sandbox-Test](sandbox/README.md).
