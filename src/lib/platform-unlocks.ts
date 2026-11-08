import "server-only";
import { db, tx } from "./db";
import { getSetting } from "./settings";
import { layers } from "./xbox";
import { accessToken, apiJson, fetchPlayedGames } from "./playstation";

type Unlock = { externalId: string; unlockedAt: string };
type Row = { id: number; game_id: number; external_id: string; title: string; playtime_min: number; last_played: string | null };
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) && Date.parse(v) > 0 ? new Date(v).toISOString() : null;

export function parseXboxUnlocks(value: unknown): Unlock[] | null {
  for (const layer of layers(value)) {
    const obj = record(layer);
    if (typeof obj.code === "number" && obj.code >= 400) return null;
    if (obj.continuationToken) return null;
    const list = obj.achievements ?? (Array.isArray(obj.titles) ? obj.titles : undefined);
    if (!Array.isArray(list)) continue;
    return list.flatMap(item => {
      const a = record(item), progress = record(a.progression);
      const unlocked = a.progressState === "Achieved" || a.isUnlocked === true || a.unlocked === true;
      const when = date(progress.timeUnlocked ?? a.timeUnlocked);
      const id = a.id;
      return unlocked && when && (typeof id === "string" || typeof id === "number") ? [{ externalId: String(id), unlockedAt: when }] : [];
    });
  }
  return null;
}

export function parsePsnUnlocks(value: unknown, prefix: string): Unlock[] | null {
  const trophies = record(value).trophies;
  if (!Array.isArray(trophies)) return null;
  return trophies.flatMap(item => {
    const a = record(item), when = date(a.earnedDateTime);
    return a.earned === true && when && (typeof a.trophyId === "number" || typeof a.trophyId === "string")
      ? [{ externalId: `${prefix}:${a.trophyId}`, unlockedAt: when }] : [];
  });
}

function candidates(platform: string, limit: number): Row[] {
  return db().prepare(`SELECT o.id, o.game_id, o.external_id, o.title, o.playtime_min, o.last_played FROM ownerships o
    LEFT JOIN achievement_sync_cache c ON c.ownership_id = o.id WHERE o.platform = ?
    AND (o.playtime_min > 0 OR o.achievements_earned > 0)
    AND (c.ownership_id IS NULL OR c.playtime_min != o.playtime_min OR c.last_played IS NOT o.last_played OR (c.succeeded = 0 AND c.checked_at < datetime('now', '-1 day')))
    ORDER BY c.checked_at ASC, o.id ASC LIMIT ?`).all(platform, limit) as unknown as Row[];
}
function store(row: Row, platform: string, unlocks: Unlock[] | null) {
  tx(() => {
    if (unlocks) {
      const insert = db().prepare(`INSERT INTO achievement_unlocks(game_id, platform, external_id, unlocked_at) VALUES (?, ?, ?, ?) ON CONFLICT(game_id, platform, external_id) DO UPDATE SET unlocked_at = excluded.unlocked_at`);
      for (const u of unlocks) insert.run(row.game_id, platform, u.externalId, u.unlockedAt);
    }
    db().prepare(`INSERT INTO achievement_sync_cache(ownership_id, playtime_min, last_played, checked_at, succeeded) VALUES (?, ?, ?, datetime('now'), ?) ON CONFLICT(ownership_id) DO UPDATE SET playtime_min=excluded.playtime_min, last_played=excluded.last_played, checked_at=excluded.checked_at, succeeded=excluded.succeeded`).run(row.id, row.playtime_min, row.last_played, unlocks ? 1 : 0);
  });
}

export async function syncXboxUnlocks(limit = 25): Promise<number> {
  const key = getSetting("xbox.apiKey"), xuid = getSetting("xbox.xuid");
  if (!key || !xuid) return 0;
  let done = 0;
  for (const row of candidates("xbox", limit)) {
    try {
      const res = await fetch(`https://api.xbl.io/v2/achievements/player/${encodeURIComponent(xuid)}/${encodeURIComponent(row.external_id)}`, { headers: { "X-Authorization": key, Accept: "application/json", "Accept-Language": "de-DE" }, cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (res.status === 429) break;
      const response: unknown = res.ok ? await res.json() : null;
      if (layers(response).some(layer => Number(record(layer).code) === 429)) break;
      const value = res.ok ? parseXboxUnlocks(response) : null;
      store(row, "xbox", value);
      if (value) done++;
    } catch { store(row, "xbox", null); }
  }
  return done;
}

export async function syncPsnUnlocks(limit = 25): Promise<number> {
  if (!getSetting("psn.refreshToken")) return 0;
  const rows = candidates("playstation", limit);
  if (!rows.length) return 0;
  const token = await accessToken();
  const played = await fetchPlayedGames(token);
  let done = 0;
  for (const row of rows) {
    const ids = played.filter(t => (t.concept?.id ? `concept:${t.concept.id}` : t.titleId) === row.external_id).map(t => t.titleId);
    if (!ids.length) { store(row, "playstation", null); continue; }
    try {
      const mapping = await apiJson<Record<string, unknown>>(`/trophy/v1/users/me/titles/trophyTitles?npTitleIds=${encodeURIComponent(ids.join(","))}`, token);
      if (!Array.isArray(mapping.titles)) throw new Error("Ung?ltige Titelzuordnung");
      const sets = new Map<string, string>();
      for (const item of mapping.titles.map(record)) {
        if (!ids.includes(String(item.npTitleId)) || !Array.isArray(item.trophyTitles)) throw new Error("Ung?ltige Titelzuordnung");
        for (const entry of item.trophyTitles.map(record)) {
          if (typeof entry.npCommunicationId !== "string" || !["trophy", "trophy2"].includes(String(entry.npServiceName))) throw new Error("Ung?ltiger Troph?ensatz");
          sets.set(entry.npCommunicationId, String(entry.npServiceName));
        }
      }
      if (mapping.titles.length !== ids.length) throw new Error("Unvollst?ndige Titelzuordnung");
      const all: Unlock[] = [];
      for (const [id, service] of sets) {
      for (let offset = 0; offset < 10000; offset += 100) {
        const page = await apiJson<Record<string, unknown>>(`/trophy/v1/users/me/npCommunicationIds/${encodeURIComponent(id)}/trophyGroups/all/trophies?npServiceName=${service}&limit=100&offset=${offset}`, token);
        const parsed = parsePsnUnlocks(page, id);
        if (!parsed) throw new Error("Ungültige Trophäenliste");
        all.push(...parsed);
        const count = (page.trophies as unknown[]).length;
        if (count < 100 || (typeof page.totalItemCount === "number" && offset + 100 >= page.totalItemCount)) break;
        if (offset === 9900) throw new Error("Unvollständige Trophäenliste");
      }
      }
      store(row, "playstation", all); done++;
    } catch (e) {
      if (e instanceof Error && /Fehler 429/.test(e.message)) break;
      store(row, "playstation", null);
    }
  }
  return done;
}
