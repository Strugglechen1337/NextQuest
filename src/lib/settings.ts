import "server-only";
import { db } from "./db";

export const SETTING_KEYS = [
  "jobs.last",
  "update.auto",
  "auto.enabled",
  "auto.time",
  "auto.lastRun",
  "descriptions.steamRetryAt",
  "steam.apiKey",
  "steam.steamId",
  "steam.lastSync",
  "igdb.clientId",
  "igdb.clientSecret",
  "igdb.token",
  "igdb.tokenExpires",
  "gamepass.enabled",
  "gamepass.catalogs",
  "gamepass.market",
  "gamepass.lastSync",
  "xbox.apiKey",
  "xbox.gamertag",
  "xbox.xuid",
  "xbox.lastSync",
  "psn.refreshToken",
  "psn.accessToken",
  "psn.accessExpires",
  "psn.refreshExpires",
  "psn.onlineId",
  "psn.lastSync",
  "gog.refreshToken",
  "gog.accessToken",
  "gog.accessExpires",
  "gog.userId",
  "gog.lastSync",
  "epic.refreshToken",
  "epic.accessToken",
  "epic.accessExpires",
  "epic.accountId",
  "epic.displayName",
  "epic.lastSync",
  "goals",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Geheimnisse, die nie im Klartext an den Browser gehen. */
export const SECRET_KEYS: SettingKey[] = [
  "steam.apiKey",
  "igdb.clientSecret",
  "igdb.token",
  "xbox.apiKey",
  "psn.refreshToken",
  "psn.accessToken",
  "gog.refreshToken",
  "gog.accessToken",
  "epic.refreshToken",
  "epic.accessToken",
];

export function getSetting(key: SettingKey): string | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: SettingKey, value: string | null) {
  if (value === null || value === "") {
    db().prepare("DELETE FROM settings WHERE key = ?").run(key);
  } else {
    db()
      .prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }
}

const INTERNAL_KEYS: string[] = [
  "jobs.last",
  "auto.lastRun",
  "descriptions.steamRetryAt",
  "igdb.token",
  "igdb.tokenExpires",
  "psn.refreshToken",
  "psn.accessToken",
  "psn.accessExpires",
  "gog.refreshToken",
  "gog.accessToken",
  "gog.accessExpires",
  "epic.refreshToken",
  "epic.accessToken",
  "epic.accessExpires",
];

function mask(v: string) {
  return v.length <= 4 ? "••••" : `••••${v.slice(-4)}`;
}

/** Einstellungen für die Oberfläche – Geheimnisse maskiert. */
export function publicSettings() {
  const out: Record<string, string | null> = {};
  for (const key of SETTING_KEYS) {
    // Interne Tokens nie an den Browser geben
    if (INTERNAL_KEYS.includes(key)) continue;
    const v = getSetting(key);
    out[key] = v && SECRET_KEYS.includes(key) ? mask(v) : v;
  }
  return out;
}
