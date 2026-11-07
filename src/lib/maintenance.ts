import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Wartungssperre für den Server-Update-Dienst.
 *
 * Der Update-Dienst legt `$NEXTQUEST_UPDATE_DIR/maintenance.lock` exklusiv an, BEVOR er prüft,
 * ob noch ein Job läuft. Solange die Datei existiert, startet die App keine neuen Jobs und keine
 * Plattform-Abgleiche. Ein bereits laufender Job wird vom Update-Dienst abgewartet
 * (`GET /api/jobs` → `running === null`). So kann zwischen Prüfung und Update kein neuer Job beginnen.
 * Eine Sperre, die älter als 2 Stunden ist, gilt als verwaist und wird ignoriert.
 */
export const MAINTENANCE_MESSAGE = "Gerade läuft ein Update – bitte in ein paar Minuten erneut versuchen.";
const STALE_MS = 2 * 60 * 60 * 1000;

export function maintenanceLockPath(): string | null {
  const dir = process.env.NEXTQUEST_UPDATE_DIR;
  return dir ? path.join(dir, "maintenance.lock") : null;
}

export function maintenanceActive(now = Date.now()): boolean {
  const file = maintenanceLockPath();
  if (!file) return false;
  try {
    return now - fs.statSync(file).mtimeMs < STALE_MS;
  } catch {
    return false;
  }
}

export function assertNoMaintenance() {
  if (maintenanceActive()) throw new Error(MAINTENANCE_MESSAGE);
}
