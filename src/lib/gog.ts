import "server-only";
import { tx } from "./db";
import { pruneOwnerships, upsertOwnership } from "./library";
import { getSetting, setSetting } from "./settings";

const CLIENT_ID = "46899977096215655";
const CLIENT_SECRET = "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9";
const REDIRECT_URI = "https://embed.gog.com/on_login_success?origin=client";

export const GOG_LOGIN_URL = `https://auth.gog.com/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&layout=client2`;

interface GogTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id?: string;
}

interface GogProduct {
  id: number;
  title: string;
  image?: string;
  isGame?: boolean;
}

interface GogFilteredResponse {
  page?: number;
  totalPages?: number;
  totalProducts?: number;
  products?: GogProduct[];
}

/** Extrahiert den Anmeldecode aus einer kompletten Redirect-URL oder gibt den Code direkt zurück. */
export function extractGogCode(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Bitte die Weiterleitungs-URL oder den Anmeldecode von GOG eintragen.");
  }
  const match = raw.match(/[?&]code=([^&#\s]+)/i);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }
  if (/^https?:\/\//i.test(raw)) {
    throw new Error(
      "In der eingegebenen URL wurde kein Parameter „code=…“ gefunden. Bitte erst bei GOG anmelden und dann die Ziel-Adresse (embed.gog.com/on_login_success?…&code=…) kopieren.",
    );
  }
  return raw.replace(/^["']|["']$/g, "").trim();
}

/** Ergänzt den relativen GOG-Bildpfad zu einer vollständigen Cover-URL. */
export function gogCover(image?: string | null): string | null {
  if (!image) return null;
  let url = image.trim();
  if (!url) return null;
  if (url.startsWith("//")) {
    url = `https:${url}`;
  } else if (url.startsWith("/")) {
    url = `https://images.gog-statics.com${url}`;
  } else if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  if (!/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(url)) {
    url = `${url}_392.jpg`;
  }
  return url;
}

function saveTokens(data: GogTokenResponse) {
  setSetting("gog.accessToken", data.access_token);
  if (data.refresh_token) {
    setSetting("gog.refreshToken", data.refresh_token);
  }
  setSetting("gog.accessExpires", String(Date.now() + (data.expires_in ?? 3600) * 1000));
  if (data.user_id) {
    setSetting("gog.userId", String(data.user_id));
  }
}

async function exchangeCode(code: string): Promise<GogTokenResponse> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetch(`https://auth.gog.com/token?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      "GOG lehnt den Anmeldecode ab (ungültig oder bereits abgelaufen). Bitte den Anmelde-Link erneut öffnen und einen frischen Code kopieren.",
    );
  }
  const data = (await res.json()) as GogTokenResponse;
  if (!data.access_token) {
    throw new Error("GOG hat kein gültiges Zugriffstoken zurückgegeben.");
  }
  return data;
}

async function refreshAccessToken(refreshToken: string): Promise<GogTokenResponse> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(`https://auth.gog.com/token?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    setSetting("gog.accessToken", null);
    setSetting("gog.accessExpires", null);
    throw new Error("Deine GOG-Sitzung ist abgelaufen. Bitte in der Einrichtung neu mit GOG verbinden.");
  }
  const data = (await res.json()) as GogTokenResponse;
  if (!data.access_token) {
    throw new Error("GOG-Token konnte nicht erneuert werden. Bitte neu verbinden.");
  }
  saveTokens(data);
  return data;
}

async function getValidToken(forceRefresh = false): Promise<string> {
  const cached = getSetting("gog.accessToken");
  const expires = Number(getSetting("gog.accessExpires") ?? 0);
  if (!forceRefresh && cached && expires > Date.now() + 60_000) {
    return cached;
  }
  const refresh = getSetting("gog.refreshToken");
  if (!refresh) {
    throw new Error("GOG ist noch nicht eingerichtet.");
  }
  const refreshed = await refreshAccessToken(refresh);
  return refreshed.access_token;
}

async function gogGet<T>(url: string, token?: string): Promise<T> {
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
    throw new Error("GOG-Zugriff verweigert oder Sitzung abgelaufen. Bitte neu mit GOG verbinden.");
  }
  if (!res.ok) {
    throw new Error(`GOG antwortet mit Fehler ${res.status}.`);
  }
  return res.json() as Promise<T>;
}

async function fetchUsername(token: string): Promise<string | null> {
  try {
    const data = await gogGet<{ username?: string }>("https://embed.gog.com/userData.json", token);
    return data.username ?? null;
  } catch {
    return null;
  }
}

export interface GogTestResult {
  userId: string;
  username: string | null;
  gameCount: number;
}

export async function testGog(codeInput: string): Promise<GogTestResult> {
  const code = extractGogCode(codeInput);
  const tokenData = await exchangeCode(code);
  const firstPage = await gogGet<GogFilteredResponse>(
    "https://embed.gog.com/account/getFilteredProducts?mediaType=1&page=1",
    tokenData.access_token,
  );
  const username = await fetchUsername(tokenData.access_token);
  const userId = String(tokenData.user_id ?? username ?? "gog-user");
  saveTokens({ ...tokenData, user_id: userId });

  const totalProducts =
    typeof firstPage.totalProducts === "number"
      ? firstPage.totalProducts
      : (firstPage.products?.length ?? 0);

  return {
    userId,
    username,
    gameCount: totalProducts,
  };
}

async function fetchAllGogGames(): Promise<GogProduct[]> {
  const first = await gogGet<GogFilteredResponse>(
    "https://embed.gog.com/account/getFilteredProducts?mediaType=1&page=1",
  );
  const all: GogProduct[] = [...(first.products ?? [])];
  const totalPages = Math.min(first.totalPages ?? 1, 100);

  for (let page = 2; page <= totalPages; page++) {
    const next = await gogGet<GogFilteredResponse>(
      `https://embed.gog.com/account/getFilteredProducts?mediaType=1&page=${page}`,
    );
    if (next.products?.length) {
      all.push(...next.products);
    }
  }

  const byId = new Map<number, GogProduct>();
  for (const p of all) {
    if (p && p.id && p.title && p.isGame !== false) {
      byId.set(p.id, p);
    }
  }
  return [...byId.values()];
}

export async function syncGog() {
  if (!getSetting("gog.refreshToken") && !getSetting("gog.accessToken")) {
    throw new Error("GOG ist noch nicht eingerichtet.");
  }
  const games = await fetchAllGogGames();
  tx(() => {
    for (const g of games) {
      upsertOwnership({
        platform: "gog",
        externalId: String(g.id),
        title: g.title,
        coverUrl: gogCover(g.image),
      });
    }
    pruneOwnerships("gog", new Set(games.map((g) => String(g.id))));
  });
  setSetting("gog.lastSync", new Date().toISOString());
  return { count: games.length };
}
