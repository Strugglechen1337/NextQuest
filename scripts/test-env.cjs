// Vor jedem Testlauf geladen (siehe "test" in package.json): Tests dürfen nie die Umgebung der
// laufenden App erben – z. B. den echten Update-Ordner mit Wartungssperre oder die echte Datenbank.
// Einzelne Tests setzen bei Bedarf eigene, temporäre Werte.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("NEXTQUEST_") || key === "DATA_DIR" || key === "APP_PASSWORD") delete process.env[key];
}
