# Automatischer Sandbox-Test

Voraussetzungen: Windows Sandbox ist aktiviert, D: ist verfügbar und es läuft keine andere Sandbox. Ein lokales Desktop-Setup mit den aktuellen Automatisierungsoptionen muss gebaut sein. Der Aufruf benötigt keine Administratorrechte:

```powershell
pwsh desktop\sandbox\run-sandbox-test.ps1
# alternativ:
pwsh desktop\sandbox\run-sandbox-test.ps1 -Setup D:\Pfad\NextQuest-Setup-0.1.0.exe
```

Der Host verwendet standardmäßig das neueste Setup unter `desktop/dist`, startet eine Sandbox mit Netzwerk und wartet höchstens 25 Minuten. Unter `D:\Temp\nq-sandbox\<Zeitstempel>\out` stehen `results.json`, `done.json`, `log.txt` sowie `app.png` und `qr.png`. Der Prozess liefert bei Fehlern Exit-Code 1. Die Sandbox installiert und deinstalliert die App still, testet Zugriffsschutz und Demo-Daten und misst Ressourcen; die Sandbox wird anschließend geschlossen.
