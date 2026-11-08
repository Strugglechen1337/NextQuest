import "server-only";
import { db, tx } from "./db";
import { getSetting } from "./settings";
import { sessionData, snapshotPlaytime } from "./session-data";
import { effectiveStatus, GAME_STATUSES, type GameStatus } from "./game-status";
import { PLATFORMS, type PlatformId } from "./platforms";
import type { Game, LibraryStats, Ownership } from "./types";

import { normalizeTitle } from "./normalize-title";
export { normalizeTitle } from "./normalize-title";

interface GameRow {
  id: number;
  title: string;
  igdb_id: number | null;
  cover_url: string | null;
  rating: number | null;
  rating_count: number | null;
  genres: string | null;
  modes: string | null;
  keywords: string | null;
  session_pref: Game["sessionPref"];
  ttb_hastily: number | null;
  ttb_normally: number | null;
  ttb_completely: number | null;
  release_year: number | null;
  summary: string | null;
  summary_de: string | null;
  summary_de_state: string | null;
  completed: number;
  completed_at: string | null;
  completed_on: string | null;
  created_at: string | null;
  status: string | null;
  user_note: string | null;
  user_rating: number | null;
  enrich_state: Game["enrichState"];
}

interface OwnershipRow {
  id: number;
  game_id: number;
  platform: PlatformId;
  external_id: string;
  title: string;
  playtime_min: number;
  last_played: string | null;
  first_played: string | null;
  first_seen: string | null;
  cover_url: string | null;
  source: Ownership["source"];
  achievements_earned: number | null;
  achievements_total: number | null;
  progress_pct: number | null;
  leaving_soon: number | null;
}

function descriptionSource(state: string | null): Game["summaryDeSource"] {
  try {
    const value = JSON.parse(state ?? "null");
    return value?.source ? { source: value.source, url: value.url } : null;
  } catch { return null; }
}

function parseList(v: string | null): string[] {
  if (!v) return [];
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
}

/**
 * Alle bekannten Bildquellen eines Spiels in Reihenfolge: IGDB-Cover, Plattform-Cover,
 * zuletzt das Steam-Querformat (gibt es auch für ältere Spiele ohne Hochformat-Bild).
 * Die Oberfläche probiert sie nacheinander, falls ein Bild nicht lädt.
 */
function coverChain(primary: string | null, os: OwnershipRow[]): { coverUrl: string | null; coverFallbacks: string[] } {
  const upgrade = (u: string) => (u.startsWith("http://") ? `https://${u.slice(7)}` : u);
  const list = [
    primary,
    ...os.map((o) => o.cover_url),
    ...os
      .filter((o) => o.platform === "steam" && /^\d+$/.test(o.external_id))
      .map((o) => `https://shared.steamstatic.com/store_item_assets/steam/apps/${o.external_id}/header.jpg`),
  ]
    .filter((u): u is string => !!u)
    .map(upgrade);
  const unique = [...new Set(list)];
  return { coverUrl: unique[0] ?? null, coverFallbacks: unique.slice(1) };
}

export function listGames(): Game[] {
  const learned = sessionData();
  const games = db().prepare("SELECT * FROM games").all() as unknown as GameRow[];
  const owns = db().prepare("SELECT * FROM ownerships").all() as unknown as OwnershipRow[];
  const byGame = new Map<number, OwnershipRow[]>();
  for (const o of owns) {
    const list = byGame.get(o.game_id) ?? [];
    list.push(o);
    byGame.set(o.game_id, list);
  }
  const result: Game[] = [];
  for (const g of games) {
    const os = byGame.get(g.id) ?? [];
    if (os.length === 0) continue;
    const ownedRows = os.filter((o) => !PLATFORMS[o.platform]?.subscription);
    const lastPlayed = os
      .map((o) => o.last_played)
      .filter((x): x is string => !!x)
      .sort()
      .at(-1);
    result.push({
      ...learned.get(g.id),
      id: g.id,
      title: g.title,
      igdbId: g.igdb_id,
      ...coverChain(g.cover_url, os),
      rating: g.rating,
      ratingCount: g.rating_count,
      genres: parseList(g.genres),
      modes: parseList(g.modes),
      keywords: parseList(g.keywords),
      sessionPref: g.session_pref,
      ttbHastily: g.ttb_hastily,
      ttbNormally: g.ttb_normally,
      ttbCompletely: g.ttb_completely,
      releaseYear: g.release_year,
      summary: g.summary,
      summaryDe: g.summary_de,
      summaryDeSource: descriptionSource(g.summary_de_state),
      completed: !!g.completed,
      completedAt: g.completed_at ?? null,
      completedOn: g.completed_on ?? null,
      createdAt: g.created_at ?? null,
      status: effectiveStatus(g.status, !!g.completed),
      userNote: g.user_note,
      userRating: g.user_rating,
      enrichState: g.enrich_state,
      ownerships: os.map((o) => ({
        id: o.id,
        platform: o.platform,
        externalId: o.external_id,
        title: o.title,
        playtimeMin: o.playtime_min,
        lastPlayed: o.last_played,
        firstPlayed: o.first_played,
        firstSeen: o.first_seen,
        source: o.source,
        achievementsEarned: o.achievements_earned,
        achievementsTotal: o.achievements_total,
        progressPct: o.progress_pct,
        leavingSoon: o.platform === "gamepass" && !!o.leaving_soon,
      })),
      playtimeMin: os.reduce((s, o) => s + o.playtime_min, 0),
      lastPlayed: lastPlayed ?? null,
      copies: ownedRows.length,
      inGamePass: os.some((o) => o.platform === "gamepass"),
      owned: ownedRows.length > 0,
    });
  }
  return result;
}

export function stats(games: Game[]): LibraryStats {
  return {
    total: games.length,
    owned: games.filter((g) => g.owned).length,
    duplicates: games.filter((g) => g.copies > 1).length,
    completed: games.filter((g) => g.completed).length,
    playtimeMin: games.reduce((s, g) => s + g.playtimeMin, 0),
    gamePassOnly: games.filter((g) => !g.owned && g.inGamePass).length,
    pendingEnrich: games.filter((g) => g.enrichState === "pending").length,
  };
}

export interface OwnershipInput {
  platform: PlatformId;
  achievementsEarned?: number | null;
  achievementsTotal?: number | null;
  progressPct?: number | null;
  leavingSoon?: boolean;
  externalId: string;
  title: string;
  playtimeMin?: number;
  lastPlayed?: string | null;
  firstPlayed?: string | null;
  coverUrl?: string | null;
  source?: Ownership["source"];
  /** Optionale Metadaten, z. B. für Demo-Daten oder manuell gewählte IGDB-Treffer */
  meta?: Partial<GameMeta>;
}

export interface GameMeta {
  igdbId: number | null;
  title: string;
  coverUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  genres: string[];
  modes: string[];
  keywords?: string[];
  ttbHastily: number | null;
  ttbNormally: number | null;
  ttbCompletely: number | null;
  releaseYear: number | null;
  summary: string | null;
}

function findOrCreateGame(title: string, igdbId?: number | null): number {
  const d = db();
  if (igdbId) {
    const byIgdb = d.prepare("SELECT id FROM games WHERE igdb_id = ?").get(igdbId) as
      | { id: number }
      | undefined;
    if (byIgdb) return byIgdb.id;
  }
  const norm = normalizeTitle(title);
  const byName = d.prepare("SELECT id FROM games WHERE norm_title = ? ORDER BY id LIMIT 1").get(norm) as
    | { id: number }
    | undefined;
  if (byName) return byName.id;
  const res = d.prepare("INSERT INTO games (title, norm_title) VALUES (?, ?)").run(title, norm);
  return Number(res.lastInsertRowid);
}

/** Legt einen Besitz-Eintrag an oder aktualisiert ihn. Gibt die Spiel-ID zurück. */
export function upsertOwnership(input: OwnershipInput): number {
  const d = db();
  const existing = d
    .prepare("SELECT id, game_id FROM ownerships WHERE platform = ? AND external_id = ?")
    .get(input.platform, input.externalId) as { id: number; game_id: number } | undefined;

  if (existing) {
    snapshotPlaytime(existing.game_id, input.platform);
    d.prepare(
      `UPDATE ownerships SET title = ?, playtime_min = MAX(playtime_min, ?), last_played = COALESCE(?, last_played), first_played = COALESCE(?, first_played),
       cover_url = COALESCE(?, cover_url) WHERE id = ?`,
    ).run(
      input.title,
      input.playtimeMin ?? 0,
      input.lastPlayed ?? null,
      input.firstPlayed ?? null,
      input.coverUrl ?? null,
      existing.id,
    );
    snapshotPlaytime(existing.game_id, input.platform);
    saveOwnershipExtras(input);
    return existing.game_id;
  }

  const gameId = findOrCreateGame(input.meta?.title ?? input.title, input.meta?.igdbId);
  const syncKeys = { steam: "steam.lastSync", xbox: "xbox.lastSync", playstation: "psn.lastSync", gog: "gog.lastSync", epic: "epic.lastSync", gamepass: "gamepass.lastSync" } as const;
  const syncKey = syncKeys[input.platform as keyof typeof syncKeys];
  d.prepare(
    `INSERT INTO ownerships (game_id, platform, external_id, title, playtime_min, last_played, first_played, cover_url, source, first_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    gameId,
    input.platform,
    input.externalId,
    input.title,
    input.playtimeMin ?? 0,
    input.lastPlayed ?? null,
    input.firstPlayed ?? null,
    input.coverUrl ?? null,
    input.source ?? "sync",
    input.source === "manual" || input.source === "demo" || (syncKey && getSetting(syncKey)) ? new Date().toISOString() : null,
  );
  saveOwnershipExtras(input);
  if (input.meta) {
    const state = input.meta.igdbId ? "done" : input.source === "demo" ? "manual" : undefined;
    const target = applyMeta(gameId, input.meta, state);
    snapshotPlaytime(target, input.platform);
    return target;
  }
  snapshotPlaytime(gameId, input.platform);
  return gameId;
}

/** Schreibt Metadaten an ein Spiel; existiert die IGDB-ID schon, werden die Spiele zusammengeführt. */
export function applyMeta(gameId: number, meta: Partial<GameMeta>, state?: Game["enrichState"]): number {
  const d = db();
  let target = gameId;
  if (meta.igdbId) {
    const other = d.prepare("SELECT id FROM games WHERE igdb_id = ? AND id != ?").get(meta.igdbId, gameId) as
      | { id: number }
      | undefined;
    if (other) {
      mergeGames(gameId, other.id);
      target = other.id;
    }
  }
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  const put = (col: string, v: unknown) => {
    if (v === undefined) return;
    sets.push(`${col} = ?`);
    vals.push(Array.isArray(v) ? JSON.stringify(v) : (v as string | number | null));
  };
  put("igdb_id", meta.igdbId);
  if (meta.title) {
    put("title", meta.title);
    put("norm_title", normalizeTitle(meta.title));
  }
  put("cover_url", meta.coverUrl);
  put("rating", meta.rating);
  put("rating_count", meta.ratingCount);
  put("genres", meta.genres);
  put("modes", meta.modes);
  put("keywords", meta.keywords);
  put("ttb_hastily", meta.ttbHastily);
  put("ttb_normally", meta.ttbNormally);
  put("ttb_completely", meta.ttbCompletely);
  put("release_year", meta.releaseYear);
  put("summary", meta.summary);
  put("enrich_state", state);
  if (sets.length) d.prepare(`UPDATE games SET ${sets.join(", ")} WHERE id = ?`).run(...vals, target);
  return target;
}

/** Verschiebt alle Einträge von `fromId` nach `intoId` und löscht `fromId`. */
export function mergeGames(fromId: number, intoId: number) {
  const d = db();
  d.prepare("UPDATE games SET completed_on = COALESCE(completed_on, (SELECT completed_on FROM games WHERE id = ?)) WHERE id = ?").run(fromId, intoId);
  d.prepare("UPDATE playtime_snapshots SET game_id = ? WHERE game_id = ?").run(intoId, fromId);
  d.prepare(`INSERT OR IGNORE INTO achievement_unlocks(game_id, platform, external_id, unlocked_at)
    SELECT ?, platform, external_id, unlocked_at FROM achievement_unlocks WHERE game_id = ?`).run(intoId, fromId);
  d.prepare("INSERT OR IGNORE INTO suggestion_feedback(game_id, time_class, value) SELECT ?, time_class, value FROM suggestion_feedback WHERE game_id = ?").run(intoId, fromId);
  d.prepare("INSERT OR IGNORE INTO steam_tags(game_id, name, votes) SELECT ?, name, votes FROM steam_tags WHERE game_id = ?").run(intoId, fromId);
  const source = d.prepare("SELECT status, completed, user_note, user_rating FROM games WHERE id = ?").get(fromId) as { status: string | null; completed: number; user_note: string | null; user_rating: number | null } | undefined;
  const target = d.prepare("SELECT status, completed FROM games WHERE id = ?").get(intoId) as { status: string | null; completed: number } | undefined;
  if (source && target) {
    const status = source.completed || target.completed ? "completed" : (!target.status || target.status === "open") ? effectiveStatus(source.status, false) : effectiveStatus(target.status, false);
    setGameStatus(intoId, status);
    d.prepare("UPDATE games SET user_note = COALESCE(NULLIF(user_note, ''), ?), user_rating = COALESCE(user_rating, ?) WHERE id = ?").run(source.user_note, source.user_rating, intoId);
  }
  d.prepare(
    `UPDATE games SET completed = MAX(completed, (SELECT completed FROM games WHERE id = ?)),
      session_pref = COALESCE(session_pref, (SELECT session_pref FROM games WHERE id = ?)),
      summary_de = COALESCE(NULLIF(summary_de, ''), (SELECT summary_de FROM games WHERE id = ?)),
      summary_de_state = CASE WHEN NULLIF(summary_de, '') IS NOT NULL THEN summary_de_state ELSE (SELECT summary_de_state FROM games WHERE id = ?) END WHERE id = ?`,
  ).run(fromId, fromId, fromId, fromId, intoId);
  d.prepare("UPDATE ownerships SET game_id = ? WHERE game_id = ?").run(intoId, fromId);
  d.prepare("DELETE FROM games WHERE id = ?").run(fromId);
}

function saveOwnershipExtras(input: OwnershipInput) {
  const pairs: [string, number][] = [];
  for (const [key, column] of [["achievementsEarned", "achievements_earned"], ["achievementsTotal", "achievements_total"], ["progressPct", "progress_pct"]] as const) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && (key !== "progressPct" || value <= 100)) pairs.push([column, value]);
  }
  if (input.platform === "gamepass" && input.leavingSoon !== undefined) pairs.push(["leaving_soon", input.leavingSoon ? 1 : 0]);
  if (pairs.length) db().prepare(`UPDATE ownerships SET ${pairs.map(([col]) => `${col} = ?`).join(", ")} WHERE platform = ? AND external_id = ?`).run(...pairs.map(([,v]) => v), input.platform, input.externalId);
}

export function setGameStatus(gameId: number, status: GameStatus) {
  if (!Object.hasOwn(GAME_STATUSES, status)) throw new Error("Ungültiger Status");
  db().prepare("UPDATE games SET status = ?, completed = ?, completed_at = CASE WHEN ? THEN COALESCE(completed_at, datetime('now')) END, completed_on = CASE WHEN ? AND completed = 0 THEN COALESCE(completed_on, (SELECT substr(MAX(unlocked_at), 1, 10) FROM achievement_unlocks WHERE game_id = ?)) ELSE completed_on END WHERE id = ?").run(status, status === "completed" ? 1 : 0, status === "completed" ? 1 : 0, status === "completed" ? 1 : 0, gameId, gameId);
}

export function setCompletedOn(gameId: number, value: unknown) {
  if (value !== null && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) throw new Error("Ungültiges Abschlussdatum");
  db().prepare("UPDATE games SET completed_on = ? WHERE id = ?").run(value as string | null, gameId);
}

export function setUserReview(gameId: number, note: unknown, rating: unknown) {
  if (note !== undefined && note !== null && (typeof note !== "string" || note.length > 20000)) throw new Error("Ungültige Notiz (maximal 20000 Zeichen)");
  if (rating !== undefined && rating !== null && (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error("Bewertung muss zwischen 1 und 5 liegen");
  if (note !== undefined) db().prepare("UPDATE games SET user_note = ? WHERE id = ?").run(note as string | null, gameId);
  if (rating !== undefined) db().prepare("UPDATE games SET user_rating = ? WHERE id = ?").run(rating as number | null, gameId);
}

export function setCompleted(gameId: number, completed: boolean) {
  setGameStatus(gameId, completed ? "completed" : "open");
}

/** Trennt einen Besitz-Eintrag in ein eigenes Spiel ab (falls falsch zusammengeführt). */
export function splitOwnership(ownershipId: number): number {
  return tx(() => {
    const d = db();
    const o = d.prepare("SELECT * FROM ownerships WHERE id = ?").get(ownershipId) as OwnershipRow | undefined;
    if (!o) throw new Error("Eintrag nicht gefunden");
    const res = d
      .prepare("INSERT INTO games (title, norm_title, enrich_state) VALUES (?, ?, 'manual')")
      .run(o.title, normalizeTitle(o.title) + ` #${o.id}`);
    const id = Number(res.lastInsertRowid);
    d.prepare("UPDATE ownerships SET game_id = ? WHERE id = ?").run(id, ownershipId);
    return id;
  });
}

export function deleteOwnership(ownershipId: number) {
  db().prepare("DELETE FROM ownerships WHERE id = ?").run(ownershipId);
  removeOrphans();
}

export function removeOrphans() {
  db().prepare("DELETE FROM games WHERE id NOT IN (SELECT DISTINCT game_id FROM ownerships)").run();
}

/** Entfernt Einträge einer Plattform, die beim letzten Sync nicht mehr dabei waren. */
export function pruneOwnerships(platform: PlatformId, keepExternalIds: Set<string>) {
  const d = db();
  const rows = d
    .prepare("SELECT id, external_id FROM ownerships WHERE platform = ? AND source = 'sync'")
    .all(platform) as unknown as { id: number; external_id: string }[];
  const del = d.prepare("DELETE FROM ownerships WHERE id = ?");
  for (const r of rows) if (!keepExternalIds.has(r.external_id)) del.run(r.id);
  removeOrphans();
}

export function deleteBySource(source: Ownership["source"]) {
  db().prepare("DELETE FROM ownerships WHERE source = ?").run(source);
  removeOrphans();
}

export function deletePlatform(platform: PlatformId) {
  db().prepare("DELETE FROM ownerships WHERE platform = ?").run(platform);
  removeOrphans();
}
