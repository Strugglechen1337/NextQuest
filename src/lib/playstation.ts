import "server-only";
import { tx } from "./db";
import { pruneOwnerships, upsertOwnership } from "./library";
import { getSetting, setSetting } from "./settings";

/**
 * PlayStation Network – inoffizielle Endpunkte der PlayStation-App (dieselben wie im npm-Paket `psn-api`),
 * direkt per fetch angesprochen, damit keine zusätzliche Abhängigkeit nötig ist.
 *
 * Ablauf: NPSSO-Cookie → Access-Code → Access-/Refresh-Token. Tokens bleiben serverseitig;
 * das Access-Token wird bei Bedarf automatisch erneuert. Kein NPSSO wird gespeichert.
 */

const AUTH = "https://ca.account.sony.com/api/authz/v3/oauth";
const API = "https://m.np.playstation.com/api";
const CLIENT_ID = "09515159-7237-4370-9b40-3806e67c0891";
/** Basic-Auth der offiziellen PlayStation-App (öffentlich bekannt, siehe psn-api). */
const CLIENT_BASIC = "MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=";
const REDIRECT_URI = "com.scee.psxandroid.scecompcall://redirect";
const SCOPE = "psn:mobile.v2.core psn:clientapp";

const EXPIRED_MSG =
  "Die PlayStation-Anmeldung ist abgelaufen (passiert etwa alle 2 Monate). Bitte einen neuen NPSSO-Code eintragen und erneut „Testen & importieren“ klicken.";

interface PsnTokens {
  accessToken: string;
  accessExpires: string;
  refreshToken: string;
  refreshExpires: string;
}

async function psnFetch(url: string, init?: RequestInit) {
  try {
    return await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000), ...init });
  } catch {
    throw new Error("Das PlayStation Network ist gerade nicht erreichbar. Bitte Internetverbindung prüfen.");
  }
}

/** Akzeptiert den reinen Code oder das komplette JSON von der ssocookie-Seite. */
export function parseNpsso(input: string): string {
  const v = input.trim();
  const fromJson = v.match(/"npsso"\s*:\s*"([^"]+)"/)?.[1];
  const code = (fromJson ?? v).replace(/^npsso=/, "").trim();
  if (!/^[A-Za-z0-9]{64}$/.test(code))
    throw new Error(
      "Das sieht nicht wie ein NPSSO-Code aus. Er besteht aus genau 64 Buchstaben und Ziffern – kopiere nur den Wert hinter „npsso“ (ohne Anführungszeichen).",
    );
  return code;
}

async function exchangeNpssoForCode(npsso: string): Promise<string> {
  const params = new URLSearchParams({
    access_type: "offline",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
  });
  const res = await psnFetch(`${AUTH}/authorize?${params}`, {
    headers: { Cookie: `npsso=${npsso}` },
    redirect: "manual",
  });
  const location = res.headers.get("location") ?? "";
  const code = location.match(/[?&]code=([^&]+)/)?.[1];
  if (!code)
    throw new Error(
      "Sony hat den NPSSO-Code abgelehnt. Er ist falsch oder abgelaufen – melde dich auf playstation.com neu an und hole einen frischen Code.",
    );
  return decodeURIComponent(code);
}

async function requestTokens(body: Record<string, string>, onReject: string): Promise<PsnTokens> {
  const res = await psnFetch(`${AUTH}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${CLIENT_BASIC}`,
    },
    body: new URLSearchParams({ ...body, token_format: "jwt" }),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error(onReject);
  if (!res.ok) throw new Error(`Die PlayStation-Anmeldung antwortet mit Fehler ${res.status}.`);
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    refresh_token_expires_in: number;
  };
  const now = Date.now();
  if (!data.access_token || !data.refresh_token || !Number.isFinite(data.expires_in) ||
      !Number.isFinite(data.refresh_token_expires_in))
    throw new Error("Sony liefert keine gültigen Anmeldedaten. Bitte erneut verbinden.");
  return {
    accessToken: data.access_token,
    accessExpires: new Date(now + data.expires_in * 1000).toISOString(),
    refreshToken: data.refresh_token,
    refreshExpires: new Date(now + data.refresh_token_expires_in * 1000).toISOString(),
  };
}

function saveTokens(t: PsnTokens) {
  tx(() => {
  setSetting("psn.accessToken", t.accessToken);
  setSetting("psn.accessExpires", t.accessExpires);
  setSetting("psn.refreshToken", t.refreshToken);
  setSetting("psn.refreshExpires", t.refreshExpires);
  });
}

/** Liefert ein gültiges Access-Token und erneuert es bei Bedarf über das Refresh-Token. */
let refreshing: Promise<string> | null = null;

async function accessToken(forceRefresh = false): Promise<string> {
  const token = getSetting("psn.accessToken");
  const expires = getSetting("psn.accessExpires");
  if (!forceRefresh && token && expires && Date.parse(expires) - Date.now() > 60_000) return token;

  const refresh = getSetting("psn.refreshToken");
  if (!refresh) throw new Error("PlayStation ist noch nicht eingerichtet.");
  const refreshExpires = getSetting("psn.refreshExpires");
  if (refreshExpires && Date.parse(refreshExpires) <= Date.now()) throw new Error(EXPIRED_MSG);

  if (!refreshing) {
    refreshing = (async () => {
      const t = await requestTokens(
        { refresh_token: refresh, grant_type: "refresh_token", scope: SCOPE },
        EXPIRED_MSG,
      );
      saveTokens(t);
      return t.accessToken;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function apiJson<T>(path: string, token: string, retry = true): Promise<T> {
  const res = await psnFetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    if (retry && token === getSetting("psn.accessToken"))
      return apiJson<T>(path, await accessToken(true), false);
    throw new Error(EXPIRED_MSG);
  }
  if (res.status === 403)
    throw new Error("Das PlayStation Network verweigert den Zugriff auf die Spieleliste. Bitte erneut verbinden.");
  if (!res.ok) throw new Error(`Das PlayStation Network antwortet mit Fehler ${res.status}.`);
  return res.json() as Promise<T>;
}

interface PsnTitle {
  titleId: string;
  name: string;
  localizedName?: string;
  imageUrl?: string;
  localizedImageUrl?: string;
  category: string;
  playDuration?: string;
  lastPlayedDateTime?: string;
  concept?: { id?: number; name?: string };
}

interface PsnTitlesPage {
  titles: PsnTitle[];
  nextOffset?: number | null;
  totalItemCount?: number;
}

/** ISO-8601-Dauer wie „PT228H56M33S“ (auch mit Tagen, „P1DT2H“) → ganze Minuten. */
export function isoDurationToMinutes(iso: string | null | undefined): number {
  const m = iso?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return Math.round(Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0) + Number(s ?? 0) / 60);
}

async function fetchPlayedGames(token: string): Promise<PsnTitle[]> {
  const out: PsnTitle[] = [];
  const limit = 200;
  for (let offset = 0, guard = 0; guard < 50; guard++) {
    const page = await apiJson<PsnTitlesPage>(
      `/gamelist/v2/users/me/titles?categories=ps4_game,ps5_native_game&limit=${limit}&offset=${offset}`,
      token,
    );
    if (!Array.isArray(page.titles) || page.titles.some((t) => !t.titleId || !t.name))
      throw new Error("Sony liefert eine unvollständige Spieleliste. Bitte später erneut synchronisieren.");
    out.push(...page.titles.filter((t) => t.category === "ps4_game" || t.category === "ps5_native_game"));
    if (page.nextOffset == null || page.nextOffset === -1) return out;
    if (page.nextOffset <= offset || !page.titles.length)
      throw new Error("Die PlayStation-Spieleliste konnte nicht vollständig geladen werden. Bitte erneut versuchen.");
    offset = page.nextOffset;
  }
  throw new Error("Die PlayStation-Spieleliste ist zu groß oder unvollständig. Der Import wurde sicherheitshalber abgebrochen.");
}

async function fetchOnlineId(token: string): Promise<string | null> {
  try {
    const p = await apiJson<{ onlineId?: string }>("/userProfile/v1/internal/users/me/profiles", token);
    return p.onlineId ?? null;
  } catch {
    return null;
  }
}

export interface PsnGame {
  externalId: string;
  title: string;
  playtimeMin: number;
  lastPlayed: string | null;
  coverUrl: string | null;
}

/**
 * Fasst PS4- und PS5-Fassung desselben Spiels über die Concept-ID zusammen (sonst stünde es doppelt
 * als „PlayStation“-Exemplar in der Bibliothek). Spielzeiten werden addiert, das jüngste Spieldatum gewinnt,
 * Name und Cover kommen bevorzugt von der PS5-Fassung. Ohne Concept-ID dient die Title-ID als Schlüssel.
 */
export function groupTitles(titles: PsnTitle[]): PsnGame[] {
  const map = new Map<string, PsnGame & { ps5: boolean }>();
  for (const t of titles) {
    const key = t.concept?.id ? `concept:${t.concept.id}` : t.titleId;
    const ps5 = t.category === "ps5_native_game";
    const g = {
      externalId: key,
      title: (t.localizedName || t.name || t.concept?.name || t.titleId).replace(/[™®]/g, "").trim(),
      playtimeMin: isoDurationToMinutes(t.playDuration),
      lastPlayed: t.lastPlayedDateTime ?? null,
      coverUrl: t.localizedImageUrl || t.imageUrl || null,
      ps5,
    };
    const prev = map.get(key);
    if (!prev) {
      map.set(key, g);
      continue;
    }
    prev.playtimeMin += g.playtimeMin;
    if (g.lastPlayed && (!prev.lastPlayed || g.lastPlayed > prev.lastPlayed)) prev.lastPlayed = g.lastPlayed;
    if (ps5 && !prev.ps5) {
      prev.title = g.title;
      prev.coverUrl = g.coverUrl ?? prev.coverUrl;
      prev.ps5 = true;
    } else if (!prev.coverUrl) prev.coverUrl = g.coverUrl;
  }
  return [...map.values()].map((g) => ({ externalId: g.externalId, title: g.title,
    playtimeMin: g.playtimeMin, lastPlayed: g.lastPlayed, coverUrl: g.coverUrl }));
}

export interface PsnTestResult {
  onlineId: string | null;
  gameCount: number;
  refreshExpires: string;
}

/** Tauscht den NPSSO gegen Tokens, prüft den Zugriff und speichert bei Erfolg. Der NPSSO selbst wird nicht gespeichert. */
export async function testPlayStation(npssoInput: string): Promise<PsnTestResult> {
  const npsso = parseNpsso(npssoInput);
  const code = await exchangeNpssoForCode(npsso);
  const tokens = await requestTokens(
    { code, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" },
    "Sony hat die Anmeldung abgelehnt. Bitte einen frischen NPSSO-Code holen und erneut versuchen.",
  );
  const [onlineId, titles] = await Promise.all([
    fetchOnlineId(tokens.accessToken),
    fetchPlayedGames(tokens.accessToken),
  ]);
  saveTokens(tokens);
  setSetting("psn.onlineId", onlineId);
  return { onlineId, gameCount: groupTitles(titles).length, refreshExpires: tokens.refreshExpires };
}

export async function syncPlayStation() {
  const token = await accessToken();
  const games = groupTitles(await fetchPlayedGames(token));
  if (games.length === 0)
    throw new Error(
      "Das PlayStation Network liefert keine Spiele. Es werden nur PS4- und PS5-Spiele erfasst, die mindestens einmal gestartet wurden.",
    );
  tx(() => {
    for (const g of games) upsertOwnership({ platform: "playstation", ...g });
    pruneOwnerships("playstation", new Set(games.map((g) => g.externalId)));
  });
  if (!getSetting("psn.onlineId")) setSetting("psn.onlineId", await fetchOnlineId(token));
  setSetting("psn.lastSync", new Date().toISOString());
  return { count: games.length };
}

export function disconnectPlayStation() {
  for (const k of ["psn.refreshToken", "psn.accessToken", "psn.accessExpires", "psn.refreshExpires", "psn.onlineId", "psn.lastSync"] as const)
    setSetting(k, null);
}
