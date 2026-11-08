import "server-only";
import { db, tx } from "./db";
import { getSetting } from "./settings";

export function parseSteamUnlocks(data: unknown): { externalId: string; unlockedAt: string }[] | null {
  const player = (data as { playerstats?: { success?: boolean; achievements?: unknown } } | null)?.playerstats;
  if (player?.success !== true || !Array.isArray(player.achievements)) return null;
  return player.achievements.flatMap((a: { apiname?: unknown; achieved?: unknown; unlocktime?: unknown }) => {
    if (typeof a.apiname !== "string" || !a.apiname || a.achieved !== 1 || typeof a.unlocktime !== "number" || !Number.isFinite(a.unlocktime) || a.unlocktime <= 0 || a.unlocktime > 253402300799) return [];
    return [{ externalId: a.apiname, unlockedAt: new Date(a.unlocktime * 1000).toISOString() }];
  });
}

/** Independent, bounded enrichment: never modifies the platform library sync. */
export async function syncSteamUnlocks(limit = 25): Promise<number> {
  const key = getSetting("steam.apiKey"), steamId = getSetting("steam.steamId");
  if (!key || !steamId) return 0;
  const rows = db().prepare(`SELECT o.id, o.game_id, o.external_id, o.playtime_min, o.last_played
    FROM ownerships o LEFT JOIN achievement_sync_cache c ON c.ownership_id = o.id
    WHERE o.platform = 'steam' AND o.playtime_min > 0 AND
      (c.ownership_id IS NULL OR c.playtime_min != o.playtime_min OR c.last_played IS NOT o.last_played OR (c.succeeded = 0 AND c.checked_at < datetime('now', '-1 day')))
    ORDER BY c.checked_at ASC, o.id ASC LIMIT ?`).all(limit) as unknown as {
      id: number; game_id: number; external_id: string; playtime_min: number; last_played: string | null;
    }[];
  let done = 0;
  for (const row of rows) {
    let success = false;
    try {
      const params = new URLSearchParams({ key, steamid: steamId, appid: row.external_id });
      const res = await fetch(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?${params}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      const unlocks = res.ok ? parseSteamUnlocks(await res.json()) : null;
      if (!unlocks) throw new Error("Erfolge nicht verfügbar");
      tx(() => {
        const insert = db().prepare(`INSERT INTO achievement_unlocks(game_id, platform, external_id, unlocked_at) VALUES (?, 'steam', ?, ?) ON CONFLICT(game_id, platform, external_id) DO UPDATE SET unlocked_at = excluded.unlocked_at`);
        for (const unlock of unlocks) insert.run(row.game_id, unlock.externalId, unlock.unlockedAt);
      });
      success = true;
      done++;
    } catch { /* Private profiles and transient failures leave cached data untouched. */ }
    db().prepare(`INSERT INTO achievement_sync_cache(ownership_id, playtime_min, last_played, checked_at, succeeded) VALUES (?, ?, ?, datetime('now'), ?) ON CONFLICT(ownership_id) DO UPDATE SET playtime_min = excluded.playtime_min, last_played = excluded.last_played, checked_at = excluded.checked_at, succeeded = excluded.succeeded`).run(row.id, row.playtime_min, row.last_played, success ? 1 : 0);
  }
  return done;
}
