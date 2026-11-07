import "server-only";
import { tx } from "./db";
import { steamProgress, type AchievementProgress } from "./achievement-progress";
import { pruneOwnerships, upsertOwnership } from "./library";
import { getSetting, setSetting } from "./settings";

const API = "https://api.steampowered.com";

export function steamCover(appId: string | number) {
  return `https://shared.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
}

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new Error("Steam lehnt den API-Key ab. Bitte prüfen.");
  if (!res.ok) throw new Error(`Steam antwortet mit Fehler ${res.status}`);
  return res.json();
}

/** Akzeptiert SteamID64, Profil-URL (/profiles/… oder /id/…) oder den Profilnamen. */
export async function resolveSteamId(input: string, apiKey: string): Promise<string> {
  const v = input.trim().replace(/\/+$/, "");
  const direct = v.match(/(\d{17})$/);
  if (direct) return direct[1];
  const vanity = v.match(/steamcommunity\.com\/id\/([^/?#]+)/)?.[1] ?? v;
  const data = await getJson(
    `${API}/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(apiKey)}&vanityurl=${encodeURIComponent(vanity)}`,
  );
  if (data?.response?.success !== 1) throw new Error(`Steam-Profil „${vanity}“ wurde nicht gefunden.`);
  return data.response.steamid;
}

export interface SteamTestResult {
  steamId: string;
  name: string;
  avatar: string;
  profilePublic: boolean;
  gameCount: number;
}

export async function testSteam(apiKey: string, profile: string): Promise<SteamTestResult> {
  const steamId = await resolveSteamId(profile, apiKey);
  const summary = await getJson(
    `${API}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${steamId}`,
  );
  const player = summary?.response?.players?.[0];
  if (!player) throw new Error("Zu dieser SteamID gibt es kein Profil.");
  const owned = await fetchOwnedGames(apiKey, steamId);
  return {
    steamId,
    name: player.personaname,
    avatar: player.avatarmedium,
    profilePublic: player.communityvisibilitystate === 3,
    gameCount: owned.length,
  };
}

interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  rtime_last_played?: number;
}

async function fetchOwnedGames(apiKey: string, steamId: string): Promise<SteamGame[]> {
  const data = await getJson(
    `${API}/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`,
  );
  return data?.response?.games ?? [];
}

export async function syncSteam() {
  const apiKey = getSetting("steam.apiKey");
  const steamId = getSetting("steam.steamId");
  if (!apiKey || !steamId) throw new Error("Steam ist noch nicht eingerichtet.");
  const games = await fetchOwnedGames(apiKey, steamId);
  if (games.length === 0)
    throw new Error(
      "Steam liefert keine Spiele. Ist in den Steam-Datenschutzeinstellungen „Spieldetails“ auf „Öffentlich“ gestellt?",
    );
  const progress = new Map<number, AchievementProgress>();
  const recent = games.filter(g => g.rtime_last_played && g.rtime_last_played * 1000 >= Date.now() - 90 * 86400000)
    .sort((a,b) => (b.rtime_last_played ?? 0) - (a.rtime_last_played ?? 0)).slice(0, 50);
  for (const g of recent) {
    try {
      const res = await fetch(`${API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&appid=${g.appid}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (res.ok) progress.set(g.appid, steamProgress(await res.json()));
    } catch { /* Privat, keine Erfolge oder Dienst nicht erreichbar: vorhandene Werte erhalten. */ }
  }
  tx(() => {
    for (const g of games) {
      upsertOwnership({
        ...progress.get(g.appid),
        platform: "steam",
        externalId: String(g.appid),
        title: g.name,
        playtimeMin: g.playtime_forever,
        lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
        coverUrl: steamCover(g.appid),
      });
    }
    pruneOwnerships("steam", new Set(games.map((g) => String(g.appid))));
  });
  setSetting("steam.lastSync", new Date().toISOString());
  return { count: games.length };
}
