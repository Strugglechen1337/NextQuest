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

// Current OpenXBL wraps the upstream payload in { code, content }; accept
// direct payloads and data wrappers as well (including nested wrappers).
function layers(value: unknown): unknown[] {
  const result = [value];
  for (let i = 0; i < 10; i++) {
    const data = object(value);
    let next = data.content ?? data.data;
    // Manche Endpunkte liefern den Inhalt als JSON-Text
    if (typeof next === "string") {
      try { next = JSON.parse(next); } catch { break; }
    }
    // Liste direkt im Inhalt → als { titles } behandeln
    if (Array.isArray(next)) next = { titles: next };
    if (next === null || typeof next !== "object") break;
    result.push(next);
    value = next;
  }
  return result;
}

function payload(value: unknown) {
  return object(layers(value).at(-1));
}

function unexpectedFormat(response: unknown): never {
  const top = object(response);
  const keys = Object.keys(top).join(", ") || "keine";
  // Für die Fehlersuche: Code und Art/Schlüssel des Inhalts nennen (keine Inhalte, keine Keys)
  const inner = top.content ?? top.data;
  const innerInfo = inner === undefined ? "" : Array.isArray(inner) ? `, Inhalt: Liste mit ${inner.length} Einträgen`
    : inner !== null && typeof inner === "object" ? `, Inhalt-Schlüssel: ${Object.keys(inner).slice(0, 8).join(", ") || "keine"}`
    : `, Inhalt: ${typeof inner}${typeof inner === "string" ? ` (${inner.length} Zeichen)` : ""}`;
  const code = top.code !== undefined ? `, Code: ${String(top.code)}` : "";
  const message = `OpenXBL-Antwort hat unerwartetes Format (Schlüssel: ${keys}${code}${innerInfo}).`;
  console.error(message);
  throw new Error(message);
}

function xuidValue(value: unknown): string | undefined {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return;
  if ((typeof value === "string" || typeof value === "number") && /^\d+$/.test(String(value)))
    return String(value);
}

export async function testXbox(apiKey: string) {
  const response = await request(apiKey, "/account");
  const data = payload(response);
  const profile = object(Array.isArray(data.profileUsers) ? data.profileUsers[0] : undefined);
  const settings = Array.isArray(profile.settings) ? profile.settings.map(object) : [];
  const gamertag = ["Gamertag", "ModernGamertag", "UniqueModernGamertag", "GameDisplayName"]
    .map(id => settings.find(s => s.id === id)?.value)
    .find((value): value is string => typeof value === "string" && !!value.trim());
  const xuid = xuidValue(profile.id) ?? xuidValue(data.xuid) ?? xuidValue(profile.hostId);
  if (!xuid) unexpectedFormat(response);
  return { xuid, gamertag: gamertag ?? "Xbox-Konto" };
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

// Current batches return statlistscollection[].stats[] with xuid/titleid on
// each stat; older responses nest title groups under users[].
function minutes(response: unknown, xuid: string) {
  const data = payload(response);
  const result = new Map<string, number>();
  const add = (stat: Record<string, unknown>, titleId: unknown, userId: unknown) => {
    const value = stat.value;
    if (String(userId) === xuid && stat.name === "MinutesPlayed" && /^\d+$/.test(String(titleId)) &&
      (typeof value === "string" || typeof value === "number") && String(value).trim() &&
      Number.isFinite(Number(value)) && Number(value) >= 0)
      result.set(String(titleId), Math.floor(Number(value)));
  };
  if (!Array.isArray(data.users) && !Array.isArray(data.statlistscollection)) unexpectedFormat(response);
  for (const list of Array.isArray(data.statlistscollection) ? data.statlistscollection.map(object) : []) {
    for (const stat of Array.isArray(list.stats) ? list.stats.map(object) : [])
      add(stat, stat.titleid ?? stat.titleId, stat.xuid);
  }
  const users = data.users;
  for (const user of Array.isArray(users) ? users.map(object) : []) {
    if (String(user.xuid) !== xuid) continue;
    const collections = user.statlistscollection;
    for (const group of Array.isArray(collections) ? collections.map(object) : []) {
      const stats = Array.isArray(group.stats) ? group.stats.map(object) : [];
      for (const stat of stats) add(stat, stat.titleid ?? stat.titleId ?? group.titleId ?? group.titleid, user.xuid);
    }
  }
  return result;
}

/** Spiel oder App? Typ-Angaben unterscheiden sich je nach OpenXBL-Version und Gerät. */
function isGame(t: Record<string, unknown>): boolean {
  const kind = String(t.type ?? t.titleType ?? "").toLowerCase();
  const media = String(t.mediaItemType ?? "").toLowerCase();
  if (kind === "game" || media.includes("game")) return true;
  if (kind === "app" || kind === "application" || media.includes("app")) return false;
  // Keine eindeutige Typ-Angabe: nur Titel mit Erfolgen/Gamerscore gelten als Spiele (Apps haben keine)
  const ach = object(t.achievement);
  return Number(ach.totalAchievements ?? ach.totalGamerscore ?? 0) > 0;
}

export async function syncXbox() {
  const apiKey = getSetting("xbox.apiKey");
  const xuid = getSetting("xbox.xuid");
  if (!apiKey || !xuid) throw new Error("Xbox ist noch nicht eingerichtet.");
  let response = await request(apiKey, "/player/titleHistory");
  let data = payload(response);
  if (!Array.isArray(data.titles)) unexpectedFormat(response);
  // Leere Titel-Historie (z. B. wegen Datenschutz-Freigabe): Erfolgs-Liste als zweite Quelle versuchen.
  // Diese Liste kann unvollständig sein – daher wird in diesem Fall nichts entfernt (nur ergänzt).
  let fromFallback = false;
  if (data.titles.length === 0) {
    const alt = await request(apiKey, "/achievements").catch(() => null);
    const altData = alt ? payload(alt) : {};
    if (Array.isArray(altData.titles) && altData.titles.length) {
      response = alt;
      data = altData;
      fromFallback = true;
    }
  }
  if (!Array.isArray(data.titles)) unexpectedFormat(response);
  // Never prune from a truncated response: no continuation contract is documented.
  if (layers(response).some(layer => object(object(layer).pagingInfo).continuationToken || object(layer).continuationToken))
    throw new Error("OpenXBL hat nur einen Teil der Titel-Historie geliefert. Die vorhandene Bibliothek bleibt erhalten; bitte später erneut versuchen.");
  const titles = data.titles.map(object);
  const games = titles.filter(g =>
    isGame(g) && typeof g.name === "string" && g.name.trim() && /^\d+$/.test(String(g.titleId)),
  ) as unknown as Title[];
  if (!games.length) {
    // Diagnose ohne Inhalte: Anzahl und vorkommende Typ-Angaben
    const kinds = [...new Set(titles.map(t => String(t.type ?? t.mediaItemType ?? t.titleType ?? "ohne Typ")))].slice(0, 6);
    throw new Error(
      titles.length
        ? `OpenXBL liefert ${titles.length} Titel, aber keiner wurde als Spiel erkannt (Typen: ${kinds.join(", ")}).`
        : "OpenXBL liefert keine gestarteten Spiele. Starte ein Xbox-Spiel und prüfe die Xbox-Datenschutzeinstellungen; vorhandene Einträge bleiben erhalten.",
    );
  }
  // A filtered-out or malformed title is not evidence that an owned game vanished.
  const hasValidId = (title: Record<string, unknown>) =>
    (typeof title.titleId === "string" || (typeof title.titleId === "number" && Number.isSafeInteger(title.titleId))) &&
    /^\d+$/.test(String(title.titleId));
  const canPrune = !fromFallback && titles.every(hasValidId);
  const seenTitleIds = new Set(titles.filter(hasValidId).map(t => String(t.titleId)));
  const playtimes = new Map<string, number>();
  let warning: string | undefined = !fromFallback && !canPrune
    ? "Einige Titel haben keine gültige ID; vorhandene Xbox-Einträge bleiben erhalten."
    : undefined;
  // 100 titles per request, never one request per game.
  for (let i = 0; i < games.length; i += 100) {
    try {
      const stats = await request(apiKey, "/player/stats", {
        xuids: [xuid], stats: games.slice(i, i + 100).map(g => ({ name: "MinutesPlayed", titleId: String(g.titleId) })),
      });
      for (const [id, value] of minutes(stats, xuid)) playtimes.set(id, value);
    } catch (e) {
      warning = [warning, `Spiele importiert, Spielzeit teilweise nicht verfügbar: ${(e as Error).message}`].filter(Boolean).join(" ");
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
    // Only prune absent IDs when the title history has identifiable entries throughout.
    if (canPrune) pruneOwnerships("xbox", seenTitleIds);
    setSetting("xbox.lastSync", new Date().toISOString());
  });
  return { count: games.length, playtimeCount: playtimes.size, warning };
}
