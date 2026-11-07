import "server-only";
import { db } from "./db";
import { igdbConfigured, igdbToSteam } from "./igdb";

let running: Promise<void> | null = null;
let lastRequest = 0;

/** Single-flight, bounded batch; failures are retried next day, successful tags after 30 days. */
export function steamTagsBatch(): Promise<void> {
  if (running) return running;
  running = load().finally(() => { running = null; });
  return running;
}

async function load() {
  const games = db().prepare(`SELECT g.id, g.igdb_id, c.app_id FROM games g
    LEFT JOIN steam_tag_checks c ON c.game_id = g.id
    WHERE c.retry_at IS NULL OR c.retry_at <= datetime('now')
    ORDER BY c.checked_at, g.id LIMIT 100`).all() as { id: number; igdb_id: number | null; app_id: string | null }[];
  const owns = db().prepare("SELECT game_id, external_id FROM ownerships WHERE platform = 'steam'").all() as { game_id: number; external_id: string }[];
  const map = igdbConfigured() ? await igdbToSteam(games.filter(g => g.igdb_id).map(g => g.igdb_id!)).catch(() => new Map<number, string[]>()) : new Map<number, string[]>();
  for (const game of games) {
    const id = owns.find(o => o.game_id === game.id && /^\d+$/.test(o.external_id))?.external_id ?? map.get(game.igdb_id!)?.find(id => /^\d+$/.test(id));
    let successful = false;
    try {
      if (id) {
        const pause = lastRequest + 1100 - Date.now();
        if (pause > 0) await new Promise(resolve => setTimeout(resolve, pause));
        lastRequest = Date.now();
        const res = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${id}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (res.ok) {
          const data = await res.json() as { tags?: unknown };
          if (data.tags && typeof data.tags === "object" && !Array.isArray(data.tags)) {
            const tags = Object.entries(data.tags).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 30);
            for (const [name, votes] of tags) db().prepare("INSERT INTO steam_tags(game_id, name, votes) VALUES (?, ?, ?) ON CONFLICT(game_id, name) DO UPDATE SET votes = excluded.votes").run(game.id, name, votes);
            successful = tags.length > 0;
          }
        }
      }
    } catch { /* Optional enrichment must never fail the sync. */ }
    db().prepare(`INSERT INTO steam_tag_checks(game_id, checked_at, retry_at, app_id) VALUES (?, datetime('now'), datetime('now', ?), ?)
      ON CONFLICT(game_id) DO UPDATE SET checked_at = excluded.checked_at, retry_at = excluded.retry_at, app_id = excluded.app_id`).run(game.id, successful ? '+30 days' : '+1 day', id ?? null);
  }
}
