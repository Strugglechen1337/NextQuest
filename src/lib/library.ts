import "server-only";
import { db, tx } from "./db";
import { PLATFORMS, type PlatformId } from "./platforms";
import type { Game, LibraryStats, Ownership } from "./types";

/** Vereinheitlicht Titel, damit dasselbe Spiel aus verschiedenen Stores zusammenfindet. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[™®©]/g, "")
    .replace(/\((pc|windows|windows 10|xbox series x\|s|xbox one)\)/g, "")
    .replace(
      /\b(game of the year|goty|definitive|deluxe|complete|ultimate|standard|gold|digital|enhanced|director'?s cut|anniversary|premium)( edition)?\b/g,
      "",
    )
    .replace(/\b(edition|for windows( 10)?|windows edition|pc edition)\b/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

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
  completed: number;
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
  cover_url: string | null;
  source: Ownership["source"];
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
      completed: !!g.completed,
      enrichState: g.enrich_state,
      ownerships: os.map((o) => ({
        id: o.id,
        platform: o.platform,
        externalId: o.external_id,
        title: o.title,
        playtimeMin: o.playtime_min,
        lastPlayed: o.last_played,
        source: o.source,
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
  externalId: string;
  title: string;
  playtimeMin?: number;
  lastPlayed?: string | null;
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
    d.prepare(
      `UPDATE ownerships SET title = ?, playtime_min = MAX(playtime_min, ?), last_played = COALESCE(?, last_played),
       cover_url = COALESCE(?, cover_url) WHERE id = ?`,
    ).run(
      input.title,
      input.playtimeMin ?? 0,
      input.lastPlayed ?? null,
      input.coverUrl ?? null,
      existing.id,
    );
    return existing.game_id;
  }

  const gameId = findOrCreateGame(input.meta?.title ?? input.title, input.meta?.igdbId);
  d.prepare(
    `INSERT INTO ownerships (game_id, platform, external_id, title, playtime_min, last_played, cover_url, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    gameId,
    input.platform,
    input.externalId,
    input.title,
    input.playtimeMin ?? 0,
    input.lastPlayed ?? null,
    input.coverUrl ?? null,
    input.source ?? "sync",
  );
  if (input.meta) {
    const state = input.meta.igdbId ? "done" : input.source === "demo" ? "manual" : undefined;
    return applyMeta(gameId, input.meta, state);
  }
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
  d.prepare(
    `UPDATE games SET completed = MAX(completed, (SELECT completed FROM games WHERE id = ?)),
      session_pref = COALESCE(session_pref, (SELECT session_pref FROM games WHERE id = ?)) WHERE id = ?`,
  ).run(fromId, fromId, intoId);
  d.prepare("UPDATE ownerships SET game_id = ? WHERE game_id = ?").run(intoId, fromId);
  d.prepare("DELETE FROM games WHERE id = ?").run(fromId);
}

export function setCompleted(gameId: number, completed: boolean) {
  db()
    .prepare("UPDATE games SET completed = ?, completed_at = CASE WHEN ? THEN datetime('now') END WHERE id = ?")
    .run(completed ? 1 : 0, completed ? 1 : 0, gameId);
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
