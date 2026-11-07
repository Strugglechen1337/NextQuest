import "server-only";
import { db } from "./db";
import { typicalSession } from "./session-learning";
import type { Game, SessionPreference } from "./types";

export function snapshotPlaytime(gameId: number, platform: string) {
  const d = db();
  const current = d.prepare("SELECT SUM(playtime_min) AS minutes FROM ownerships WHERE game_id = ? AND platform = ?").get(gameId, platform) as { minutes: number | null };
  if (current.minutes === null) return;
  const last = d.prepare("SELECT playtime_min FROM playtime_snapshots WHERE game_id = ? AND platform = ? ORDER BY id DESC LIMIT 1").get(gameId, platform) as { playtime_min: number } | undefined;
  if (last?.playtime_min === current.minutes) return;
  d.prepare("INSERT INTO playtime_snapshots(game_id, platform, playtime_min) VALUES (?, ?, ?)").run(gameId, platform, current.minutes);
}

export function sessionData(): Map<number, Pick<Game, "learnedSessionMin" | "timeFeedback" | "steamTags">> {
  const result = new Map<number, Pick<Game, "learnedSessionMin" | "timeFeedback" | "steamTags">>();
  const get = (id: number) => {
    if (!result.has(id)) result.set(id, { learnedSessionMin: null, timeFeedback: {}, steamTags: [] });
    return result.get(id)!;
  };
  const snapshots = db().prepare("SELECT game_id, platform, playtime_min FROM playtime_snapshots ORDER BY id").all() as { game_id: number; platform: string; playtime_min: number }[];
  const grouped = new Map<number, typeof snapshots>();
  for (const row of snapshots) { const list = grouped.get(row.game_id) ?? []; list.push(row); grouped.set(row.game_id, list); }
  for (const [id, rows] of grouped) get(id).learnedSessionMin = typicalSession(rows);
  for (const row of db().prepare("SELECT * FROM suggestion_feedback").all() as { game_id: number; time_class: SessionPreference; value: number }[]) get(row.game_id).timeFeedback![row.time_class] = row.value;
  for (const row of db().prepare("SELECT game_id, name, votes FROM steam_tags").all() as { game_id: number; name: string; votes: number }[]) get(row.game_id).steamTags!.push({ name: row.name, votes: row.votes });
  return result;
}
