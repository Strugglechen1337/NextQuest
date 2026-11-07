import "server-only";
import { db } from "./db";

export const SETTING_KEYS = [
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
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Geheimnisse, die nie im Klartext an den Browser gehen. */
export const SECRET_KEYS: SettingKey[] = [
  "steam.apiKey",
  "igdb.clientSecret",
  "igdb.token",
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

function mask(v: string) {
  return v.length <= 4 ? "••••" : `••••${v.slice(-4)}`;
}

/** Einstellungen für die Oberfläche – Geheimnisse maskiert. */
export function publicSettings() {
  const out: Record<string, string | null> = {};
  for (const key of SETTING_KEYS) {
    if (
      key === "igdb.token" ||
      key === "igdb.tokenExpires" ||
      key === "gog.refreshToken" ||
      key === "gog.accessToken" ||
      key === "gog.accessExpires" ||
      key === "epic.refreshToken" ||
      key === "epic.accessToken" ||
      key === "epic.accessExpires"
    )
      continue;
    const v = getSetting(key);
    out[key] = v && SECRET_KEYS.includes(key) ? mask(v) : v;
  }
  return out;
}
