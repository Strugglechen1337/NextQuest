import "server-only";
import { tx } from "./db";
import { pruneOwnerships, upsertOwnership } from "./library";
import { getSetting, setSetting } from "./settings";

const CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a";
const CLIENT_SECRET = "daafbccc737745039dffe53d94fc76cf";
const BASIC_AUTH = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

const OAUTH_URL = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";
const LIBRARY_URL = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items";
const CATALOG_HOST = "https://catalog-public-service-prod06.ol.epicgames.com";

export const EPIC_LOGIN_URL =
  "https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a02cf8f4414e29b15921876da36f9a%26responseType%3Dcode";

interface EpicTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: string;
  account_id: string;
  displayName?: string;
}

interface EpicKeyImage {
  type: string;
  url: string;
}

interface EpicCategory {
  path: string;
}

interface EpicCatalogItem {
  id?: string;
  title?: string;
  namespace?: string;
  keyImages?: EpicKeyImage[];
  categories?: EpicCategory[];
  mainGameItem?: { id?: string } | null;
  customAttributes?: Record<string, { type?: string; value?: string }>;
}

interface EpicLibraryRecord {
  namespace: string;
  catalogItemId: string;
  appName?: string;
  sandboxType?: string;
  metadata?: EpicCatalogItem;
}

interface EpicLibraryResponse {
  records?: EpicLibraryRecord[];
  responseMetadata?: {
    nextCursor?: string | null;
  };
}

/** Akzeptiert entweder nur den authorizationCode, das komplette JSON-Objekt oder eine Redirect-URL. */
export function extractEpicCode(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Bitte den authorizationCode oder den kompletten JSON-Text von Epic Games eintragen.");
  }
  if (raw.startsWith("{") || raw.includes("authorizationCode")) {
    try {
      const parsed = JSON.parse(raw) as { authorizationCode?: string | null; redirectUrl?: string | null };
      if (parsed.authorizationCode && typeof parsed.authorizationCode === "string") {
        return parsed.authorizationCode.trim();
      }
      if (parsed.redirectUrl && typeof parsed.redirectUrl === "string") {
        const m = parsed.redirectUrl.match(/[?&]code=([^&#"\s]+)/i);
        if (m?.[1]) return decodeURIComponent(m[1]);
      }
    } catch {
      const m = raw.match(/"authorizationCode"\s*:\s*"([^"]+)"/);
      if (m?.[1]) return m[1].trim();
    }
    throw new Error(
      "Im eingefügten JSON ist kein gültiger „authorizationCode“ enthalten. Bitte zuerst bei Epic Games anmelden und den neuen Code kopieren.",
    );
  }
  const urlMatch = raw.match(/[?&]code=([^&#"\s]+)/i);
  if (urlMatch?.[1]) {
    return decodeURIComponent(urlMatch[1]);
  }
  return raw.replace(/^["']|["']$/g, "").trim();
}

function saveTokens(data: EpicTokenResponse) {
  setSetting("epic.accessToken", data.access_token);
  if (data.refresh_token) {
    setSetting("epic.refreshToken", data.refresh_token);
  }
  const expiresMs = data.expires_at
    ? new Date(data.expires_at).getTime()
    : Date.now() + (data.expires_in ?? 7200) * 1000;
  setSetting("epic.accessExpires", String(expiresMs));
  if (data.account_id) {
    setSetting("epic.accountId", data.account_id);
  }
  if (data.displayName) {
    setSetting("epic.displayName", data.displayName);
  }
}

async function exchangeCode(code: string): Promise<EpicTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    token_type: "eg1",
  });
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${BASIC_AUTH}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      "Epic Games lehnt den Anmeldecode ab (ungültig oder bereits abgelaufen – ein Code gilt nur wenige Minuten und kann nur einmal verwendet werden). Bitte den Link erneut öffnen.",
    );
  }
  const data = (await res.json()) as EpicTokenResponse;
  if (!data.access_token || !data.account_id) {
    throw new Error("Epic Games hat keine gültigen Kontodaten zurückgegeben.");
  }
  return data;
}

async function refreshAccessToken(refreshToken: string): Promise<EpicTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    token_type: "eg1",
  });
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${BASIC_AUTH}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    setSetting("epic.accessToken", null);
    setSetting("epic.accessExpires", null);
    throw new Error("Deine Epic-Games-Sitzung ist abgelaufen. Bitte in der Einrichtung neu mit Epic Games verbinden.");
  }
  const data = (await res.json()) as EpicTokenResponse;
  if (!data.access_token) {
    throw new Error("Epic-Games-Token konnte nicht erneuert werden. Bitte neu verbinden.");
  }
  saveTokens(data);
  return data;
}

async function getValidToken(forceRefresh = false): Promise<string> {
  const cached = getSetting("epic.accessToken");
  const expires = Number(getSetting("epic.accessExpires") ?? 0);
  if (!forceRefresh && cached && expires > Date.now() + 60_000) {
    return cached;
  }
  const refresh = getSetting("epic.refreshToken");
  if (!refresh) {
    throw new Error("Epic Games ist noch nicht eingerichtet.");
  }
  const refreshed = await refreshAccessToken(refresh);
  return refreshed.access_token;
}

async function epicGet<T>(url: string, token?: string): Promise<T> {
  const activeToken = token ?? (await getValidToken(false));
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${activeToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 401 && !token) {
    const newToken = await getValidToken(true);
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${newToken}`, Accept: "application/json" },
      cache: "no-store",
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("Epic-Games-Zugriff verweigert oder Sitzung abgelaufen. Bitte neu mit Epic Games verbinden.");
  }
  if (!res.ok) {
    throw new Error(`Epic Games antwortet mit Fehler ${res.status}.`);
  }
  return res.json() as Promise<T>;
}

const EXCLUDED_NAMESPACES = new Set(["ue", "twinmotion", "epic", "SeaQA"]);

function isExcludedCategory(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p === "addons" ||
    p.startsWith("addons/") ||
    p === "dlc" ||
    p.startsWith("dlc/") ||
    p === "engines" ||
    p.startsWith("engines/") ||
    p === "assets" ||
    p.startsWith("assets/") ||
    p === "plugins" ||
    p.startsWith("plugins/") ||
    p === "digitalextras" ||
    p.startsWith("digitalextras/") ||
    p === "mods" ||
    p.startsWith("mods/") ||
    p === "editors" ||
    p.startsWith("editors/") ||
    p === "projects" ||
    p.startsWith("projects/") ||
    p === "testing" ||
    p.startsWith("testing/")
  );
}

function isEligibleGame(record: EpicLibraryRecord, item: EpicCatalogItem | undefined): boolean {
  if (!record.namespace || !record.catalogItemId) return false;
  if (EXCLUDED_NAMESPACES.has(record.namespace)) return false;
  if (record.sandboxType && record.sandboxType.toUpperCase() === "PRIVATE") return false;
  if (record.appName && /^dlc/i.test(record.appName)) return false;

  if (!item) return false;
  if (item.mainGameItem?.id) return false;

  const cats = item.categories ?? [];
  if (cats.some((c) => c.path && isExcludedCategory(c.path))) {
    return false;
  }
  if (cats.length > 0) {
    const hasGameCategory = cats.some((c) => {
      const p = c.path?.toLowerCase() ?? "";
      return p === "games" || p.startsWith("games/") || p === "applications" || p.startsWith("applications/");
    });
    if (!hasGameCategory) return false;
  } else if (!record.appName) {
    return false;
  }

  const title = item.title?.trim();
  if (!title || /^test\b/i.test(title)) return false;
  return true;
}

function extractCover(item: EpicCatalogItem): string | null {
  const images = item.keyImages ?? [];
  if (!images.length) return null;
  const preferredTypes = [
    "DieselGameBoxTall",
    "OfferImageTall",
    "Thumbnail",
    "DieselGameBox",
    "OfferImageWide",
    "DieselGameBoxLogo",
  ];
  for (const t of preferredTypes) {
    const match = images.find((img) => img.type === t && img.url);
    if (match?.url) return match.url;
  }
  return images[0]?.url ?? null;
}

async function fetchLibraryRecords(token?: string): Promise<EpicLibraryRecord[]> {
  const all: EpicLibraryRecord[] = [];
  let cursor: string | null | undefined = null;
  const seenCursors = new Set<string>();

  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ includeMetadata: "true" });
    if (cursor) params.set("cursor", cursor);
    const data = await epicGet<EpicLibraryResponse>(`${LIBRARY_URL}?${params.toString()}`, token);
    if (data.records?.length) {
      all.push(...data.records);
    }
    const next = data.responseMetadata?.nextCursor;
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
  }

  return all;
}

async function fetchCatalogBulk(
  namespace: string,
  ids: string[],
  token?: string,
): Promise<Map<string, EpicCatalogItem>> {
  const out = new Map<string, EpicCatalogItem>();
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const params = new URLSearchParams({
      includeDLCDetails: "true",
      includeMainGameDetails: "true",
      country: "DE",
      locale: "de-DE",
    });
    for (const id of chunk) params.append("id", id);
    const url = `${CATALOG_HOST}/catalog/api/shared/namespace/${encodeURIComponent(namespace)}/bulk/items?${params.toString()}`;
    try {
      const data = await epicGet<Record<string, EpicCatalogItem>>(url, token);
      for (const [k, v] of Object.entries(data ?? {})) {
        if (v && typeof v === "object") out.set(k, v);
      }
    } catch {
      // Manche internen Namespaces haben keinen öffentlichen Katalog-Eintrag – Fallback auf record.metadata
    }
  }
  return out;
}

export interface EpicGameEntry {
  externalId: string;
  title: string;
  coverUrl: string | null;
}

async function fetchEpicGames(token?: string): Promise<EpicGameEntry[]> {
  const records = await fetchLibraryRecords(token);
  const eligibleRecords = records.filter(
    (r) =>
      r.namespace &&
      r.catalogItemId &&
      !EXCLUDED_NAMESPACES.has(r.namespace) &&
      r.sandboxType?.toUpperCase() !== "PRIVATE",
  );

  // Fehlende Katalog-Metadaten pro Namespace gebündelt nachladen
  const needLookupByNs = new Map<string, Set<string>>();
  for (const r of eligibleRecords) {
    const hasFullMeta = r.metadata?.title && r.metadata?.categories && r.metadata?.keyImages;
    if (!hasFullMeta) {
      const set = needLookupByNs.get(r.namespace) ?? new Set<string>();
      set.add(r.catalogItemId);
      needLookupByNs.set(r.namespace, set);
    }
  }

  const catalogByNs = new Map<string, Map<string, EpicCatalogItem>>();
  for (const [ns, idSet] of needLookupByNs.entries()) {
    const map = await fetchCatalogBulk(ns, [...idSet], token);
    catalogByNs.set(ns, map);
  }

  const gamesById = new Map<string, EpicGameEntry>();
  for (const r of eligibleRecords) {
    const fromCatalog = catalogByNs.get(r.namespace)?.get(r.catalogItemId);
    const item: EpicCatalogItem | undefined = fromCatalog
      ? { ...r.metadata, ...fromCatalog }
      : r.metadata;
    if (!isEligibleGame(r, item) || !item?.title) continue;

    const externalId = `${r.namespace}:${r.catalogItemId}`;
    if (!gamesById.has(externalId)) {
      gamesById.set(externalId, {
        externalId,
        title: item.title.trim(),
        coverUrl: extractCover(item),
      });
    }
  }

  return [...gamesById.values()];
}

export interface EpicTestResult {
  accountId: string;
  displayName: string;
  gameCount: number;
}

export async function testEpic(codeInput: string): Promise<EpicTestResult> {
  const code = extractEpicCode(codeInput);
  const tokenData = await exchangeCode(code);
  saveTokens(tokenData);

  const records = await fetchLibraryRecords(tokenData.access_token);
  const approxCount = records.filter(
    (r) =>
      r.namespace &&
      r.catalogItemId &&
      !EXCLUDED_NAMESPACES.has(r.namespace) &&
      r.sandboxType?.toUpperCase() !== "PRIVATE",
  ).length;

  return {
    accountId: tokenData.account_id,
    displayName: tokenData.displayName ?? tokenData.account_id,
    gameCount: approxCount,
  };
}

export async function syncEpic() {
  if (!getSetting("epic.refreshToken") && !getSetting("epic.accessToken")) {
    throw new Error("Epic Games ist noch nicht eingerichtet.");
  }
  const games = await fetchEpicGames();
  tx(() => {
    for (const g of games) {
      upsertOwnership({
        platform: "epic",
        externalId: g.externalId,
        title: g.title,
        coverUrl: g.coverUrl,
      });
    }
    pruneOwnerships("epic", new Set(games.map((g) => g.externalId)));
  });
  setSetting("epic.lastSync", new Date().toISOString());
  return { count: games.length };
}
