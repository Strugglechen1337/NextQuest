import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

const MAINTENANCE_MESSAGE = "Gerade läuft ein Update – bitte in ein paar Minuten erneut versuchen.";
const MAINTENANCE_STALE_MS = 2 * 60 * 60 * 1000;

/** Wartungssperre des Server-Updaters aktiv? (gleiche Regel wie src/lib/maintenance.ts) */
function maintenanceActive(): boolean {
  const dir = process.env.NEXTQUEST_UPDATE_DIR;
  if (!dir) return false;
  try {
    return Date.now() - fs.statSync(path.join(dir, "maintenance.lock")).mtimeMs < MAINTENANCE_STALE_MS;
  } catch {
    return false;
  }
}

/**
 * 1. Während eines Server-Updates werden alle schreibenden API-Anfragen abgelehnt,
 *    damit bei einem Rollback keine Änderungen verloren gehen. Lesende Anfragen bleiben möglich.
 * 2. Optionaler Zugriffsschutz fürs Heimnetz: Ist APP_PASSWORD gesetzt,
 *    fragt der Browser einmal nach Benutzername (beliebig) und Passwort.
 */
export function proxy(request: NextRequest) {
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (isWrite && request.nextUrl.pathname.startsWith("/api/") && maintenanceActive()) {
    return NextResponse.json({ error: MAINTENANCE_MESSAGE }, { status: 503, headers: { "Retry-After": "120" } });
  }

  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given === password) return NextResponse.next();
  }
  return new NextResponse("Anmeldung erforderlich", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="NextQuest", charset="UTF-8"' },
  });
}

export const config = {
  // /api/health bleibt frei, damit Docker-Healthcheck und Updater ohne Passwort prüfen können
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
