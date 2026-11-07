import "server-only";
import { tx } from "./db";
import { pruneOwnerships, upsertOwnership } from "./library";
import { getSetting, setSetting } from "./settings";

// OpenXBL's OpenAPI paths include /api; its public API host serves /v2.
const API = "https://api.xbl.io/v2";

async function request(apiKey: string, path: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "X-Authorization": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("OpenXBL ist gerade nicht erreichbar. Bitte später erneut versuchen.");
  }
  if (res.status === 401 || res.status === 403)
    throw new Error("OpenXBL lehnt den API-Key ab oder die Xbox-Anmeldung ist abgelaufen. Bitte auf xbl.io erneut anmelden und den aktuellen persönlichen API-Key kopieren; prüfe dort auch die Xbox-Datenschutzfreigabe.");
  if (res.status === 429)
    throw new Error("Das OpenXBL-Anfragelimit ist erreicht. Bitte bis zur Freigabe deines Kontingents warten und später erneut synchronisieren.");
  if (!res.ok) throw new Error(`OpenXBL antwortet mit Fehler ${res.status}. Bitte später erneut versuchen.`);
  try { return await res.json(); } catch { throw new Error("OpenXBL hat keine gültigen Spieldaten geliefert."); }
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function testXbox(apiKey: string) {
  const data = object(await request(apiKey, "/account"));
  const profile = object(Array.isArray(data.profileUsers) ? data.profileUsers[0] : undefined);
  const settings = Array.isArray(profile.settings) ? profile.settings.map(object) : [];
  const gamertag = settings.find(s => s.id === "Gamertag")?.value;
  if (typeof profile.id !== "string" || !/^\d+$/.test(profile.id) || typeof gamertag !== "string")
    throw new Error("OpenXBL liefert kein Xbox-Profil. Bitte auf xbl.io mit dem richtigen Microsoft-Konto erneut anmelden.");
  return { xuid: profile.id, gamertag };
}

interface Title {
  titleId: string;
  name: string;
  displayImage?: string;
  titleHistory?: { lastTimePlayed?: string };
}

function cover(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "store-images.s-microsoft.com") url.searchParams.set("w", "300");
    return url.toString();
  } catch { return null; }
}

// The batch response nests title groups under users[].statlistscollection[].
function minutes(data: unknown, xuid: string) {
  const result = new Map<string, number>();
  const users = object(data).users;
  for (const user of Array.isArray(users) ? users.map(object) : []) {
    if (String(user.xuid) !== xuid) continue;
    const collections = user.statlistscollection;
    for (const group of Array.isArray(collections) ? collections.map(object) : []) {
      const stats = Array.isArray(group.stats) ? group.stats.map(object) : [];
      const stat = stats.find(s => s.name === "MinutesPlayed");
      const value = stat?.value;
      if (value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0)
        result.set(String(group.titleId), Math.floor(Number(value)));
    }
  }
  return result;
}

export async function syncXbox() {
  const apiKey = getSetting("xbox.apiKey");
  const xuid = getSetting("xbox.xuid");
  if (!apiKey || !xuid) throw new Error("Xbox ist noch nicht eingerichtet.");
  const data = object(await request(apiKey, "/player/titleHistory"));
  if (!Array.isArray(data.titles)) throw new Error("OpenXBL liefert keine Titel-Historie. Prüfe deine Xbox-Datenschutzeinstellungen und die Anmeldung auf xbl.io.");
  // Never prune from a truncated response: no continuation contract is documented.
  if (object(data.pagingInfo).continuationToken || data.continuationToken)
    throw new Error("OpenXBL hat nur einen Teil der Titel-Historie geliefert. Die vorhandene Bibliothek bleibt erhalten; bitte später erneut versuchen.");
  const games = data.titles.map(object).filter(g =>
    g.type === "Game" && typeof g.name === "string" && g.name.trim() && /^\d+$/.test(String(g.titleId)),
  ) as unknown as Title[];
  if (!games.length) throw new Error("OpenXBL liefert keine gestarteten Spiele. Starte ein Xbox-Spiel und prüfe die Xbox-Datenschutzeinstellungen; vorhandene Einträge bleiben erhalten.");
  const playtimes = new Map<string, number>();
  let warning: string | undefined;
  // 100 titles per request, never one request per game.
  for (let i = 0; i < games.length; i += 100) {
    try {
      const stats = await request(apiKey, "/player/stats", {
        xuids: [xuid], stats: games.slice(i, i + 100).map(g => ({ name: "MinutesPlayed", titleId: String(g.titleId) })),
      });
      for (const [id, value] of minutes(stats, xuid)) playtimes.set(id, value);
    } catch (e) {
      warning = `Spiele importiert, Spielzeit teilweise nicht verfügbar: ${(e as Error).message}`;
      break;
    }
  }
  tx(() => {
    for (const game of games) {
      const date = game.titleHistory?.lastTimePlayed;
      upsertOwnership({ platform: "xbox", externalId: String(game.titleId), title: game.name,
        coverUrl: cover(game.displayImage), playtimeMin: playtimes.get(String(game.titleId)),
        lastPlayed: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null });
    }
    pruneOwnerships("xbox", new Set(games.map(g => String(g.titleId))));
    setSetting("xbox.lastSync", new Date().toISOString());
  });
  return { count: games.length, playtimeCount: playtimes.size, warning };
}
