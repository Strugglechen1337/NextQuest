import "server-only";
import { db, tx } from "./db";
import { applyMeta, normalizeTitle, type GameMeta } from "./library";
import { getSetting, setSetting } from "./settings";

const API = "https://api.igdb.com/v4";
const GAME_FIELDS =
  "fields id,name,cover.image_id,total_rating,total_rating_count,genres.name,themes.name,game_modes.name,first_release_date,summary";

export function igdbConfigured() {
  return !!(getSetting("igdb.clientId") && getSetting("igdb.clientSecret"));
}

async function fetchToken(clientId: string, clientSecret: string) {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: "POST", cache: "no-store" },
  );
  if (!res.ok) throw new Error("Twitch lehnt Client-ID oder Client-Secret ab. Bitte prüfen.");
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return data;
}

async function token(): Promise<{ clientId: string; token: string }> {
  const clientId = getSetting("igdb.clientId");
  const secret = getSetting("igdb.clientSecret");
  if (!clientId || !secret) throw new Error("IGDB ist noch nicht eingerichtet.");
  const cached = getSetting("igdb.token");
  const expires = Number(getSetting("igdb.tokenExpires") ?? 0);
  if (cached && expires > Date.now() + 60_000) return { clientId, token: cached };
  const t = await fetchToken(clientId, secret);
  setSetting("igdb.token", t.access_token);
  setSetting("igdb.tokenExpires", String(Date.now() + t.expires_in * 1000));
  return { clientId, token: t.access_token };
}

let lastCall = 0;
async function query<T>(endpoint: string, body: string, auth?: { clientId: string; token: string }): Promise<T> {
  const a = auth ?? (await token());
  // IGDB erlaubt 4 Anfragen pro Sekunde
  const wait = lastCall + 260 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(`${API}/${endpoint}`, {
    method: "POST",
    headers: { "Client-ID": a.clientId, Authorization: `Bearer ${a.token}`, Accept: "application/json" },
    body,
    cache: "no-store",
  });
  if (res.status === 401) {
    setSetting("igdb.token", null);
    throw new Error("IGDB-Anmeldung abgelaufen – bitte erneut versuchen.");
  }
  if (!res.ok) throw new Error(`IGDB-Fehler ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export async function testIgdb(clientId: string, clientSecret: string) {
  const t = await fetchToken(clientId, clientSecret);
  const games = await query<{ name: string }[]>(
    "games",
    'search "The Witcher 3"; fields name; limit 1;',
    { clientId, token: t.access_token },
  );
  return { ok: true, sample: games[0]?.name ?? null };
}

interface IgdbGame {
  id: number;
  name: string;
  cover?: { image_id: string };
  total_rating?: number;
  total_rating_count?: number;
  genres?: { name: string }[];
  themes?: { name: string }[];
  game_modes?: { name: string }[];
  first_release_date?: number;
  summary?: string;
}

function toMeta(g: IgdbGame): GameMeta {
  return {
    igdbId: g.id,
    title: g.name,
    coverUrl: g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null,
    rating: g.total_rating ?? null,
    ratingCount: g.total_rating_count ?? null,
    genres: [...(g.genres ?? []), ...(g.themes ?? [])].map((x) => x.name),
    modes: (g.game_modes ?? []).map((x) => x.name),
    ttbHastily: null,
    ttbNormally: null,
    ttbCompletely: null,
    releaseYear: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
    summary: g.summary ?? null,
  };
}

function escape(s: string) {
  return s.replace(/[™®©]/g, "").replace(/\\/g, "").replace(/"/g, '\\"').trim();
}

export async function searchIgdb(q: string, limit = 8): Promise<GameMeta[]> {
  const games = await query<IgdbGame[]>(
    "games",
    `search "${escape(q)}"; ${GAME_FIELDS}; where version_parent = null; limit ${limit};`,
  );
  const metas = games.map(toMeta);
  await addTimeToBeat(metas);
  return metas;
}

async function addTimeToBeat(metas: GameMeta[]) {
  const ids = metas.map((m) => m.igdbId).filter((x): x is number => !!x);
  if (!ids.length) return;
  const rows = await query<{ game_id: number; hastily?: number; normally?: number; completely?: number }[]>(
    "game_time_to_beats",
    `fields game_id,hastily,normally,completely; where game_id = (${ids.join(",")}); limit 500;`,
  );
  const byId = new Map(rows.map((r) => [r.game_id, r]));
  const min = (s?: number) => (s ? Math.round(s / 60) : null);
  for (const m of metas) {
    const r = m.igdbId ? byId.get(m.igdbId) : undefined;
    if (!r) continue;
    m.ttbHastily = min(r.hastily);
    m.ttbNormally = min(r.normally);
    m.ttbCompletely = min(r.completely);
  }
}

async function steamToIgdb(appIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!appIds.length) return map;
  const uids = appIds.map((a) => `"${a}"`).join(",");
  let rows: { game: number; uid: string }[];
  try {
    rows = await query("external_games", `fields game,uid; where external_game_source = 1 & uid = (${uids}); limit 500;`);
  } catch {
    rows = await query("external_games", `fields game,uid; where category = 1 & uid = (${uids}); limit 500;`);
  }
  for (const r of rows) map.set(r.uid, r.game);
  return map;
}

interface PendingRow {
  id: number;
  title: string;
  steam_app: string | null;
}

/** Reichert bis zu `limit` Spiele mit IGDB-Daten an. Gibt zurück, wie viele noch offen sind. */
export async function enrichBatch(limit = 40) {
  const pending = db()
    .prepare(
      `SELECT g.id, g.title,
        (SELECT external_id FROM ownerships o WHERE o.game_id = g.id AND o.platform = 'steam' LIMIT 1) AS steam_app
       FROM games g WHERE g.enrich_state = 'pending' ORDER BY g.id LIMIT ?`,
    )
    .all(limit) as unknown as PendingRow[];

  const found = new Map<number, number>(); // gameId -> igdbId

  // 1) Steam-Spiele über die Steam-AppID zuordnen (zuverlässiger als der Name)
  const steamMap = await steamToIgdb(pending.filter((p) => p.steam_app).map((p) => p.steam_app!));
  for (const p of pending) if (p.steam_app && steamMap.has(p.steam_app)) found.set(p.id, steamMap.get(p.steam_app)!);

  // 2) Rest per Namenssuche (max. 10 Suchen pro Multiquery)
  const rest = pending.filter((p) => !found.has(p.id));
  const byName = new Map<number, IgdbGame>();
  for (let i = 0; i < rest.length; i += 10) {
    const chunk = rest.slice(i, i + 10);
    const body = chunk
      .map(
        (p, idx) =>
          `query games "q${idx}" { search "${escape(p.title)}"; ${GAME_FIELDS}; where version_parent = null; limit 5; };`,
      )
      .join("\n");
    const res = await query<{ name: string; result: IgdbGame[] }[]>("multiquery", body);
    for (const r of res) {
      const p = chunk[Number(r.name.slice(1))];
      if (!p || !r.result?.length) continue;
      const norm = normalizeTitle(p.title);
      const best = r.result.find((g) => normalizeTitle(g.name) === norm) ?? r.result[0];
      byName.set(p.id, best);
    }
  }

  // 3) Details für die über Steam gefundenen IDs laden
  const steamIds = [...new Set(found.values())];
  const details = new Map<number, IgdbGame>();
  for (let i = 0; i < steamIds.length; i += 400) {
    const ids = steamIds.slice(i, i + 400);
    const rows = await query<IgdbGame[]>("games", `${GAME_FIELDS}; where id = (${ids.join(",")}); limit 500;`);
    for (const g of rows) details.set(g.id, g);
  }

  const metas = new Map<number, GameMeta>();
  for (const p of pending) {
    const g = found.has(p.id) ? details.get(found.get(p.id)!) : byName.get(p.id);
    if (g) metas.set(p.id, toMeta(g));
  }
  await addTimeToBeat([...metas.values()]);

  tx(() => {
    for (const p of pending) {
      const m = metas.get(p.id);
      if (m) {
        // Den eigenen Titel behalten, wenn die Namenssuche nur ungefähr passt
        const keepTitle = !found.has(p.id) && normalizeTitle(m.title) !== normalizeTitle(p.title);
        applyMeta(p.id, keepTitle ? { ...m, title: p.title } : m, "done");
      } else {
        db().prepare("UPDATE games SET enrich_state = 'notfound' WHERE id = ?").run(p.id);
      }
    }
  });

  const left = db().prepare("SELECT COUNT(*) AS n FROM games WHERE enrich_state = 'pending'").get() as { n: number };
  return { processed: pending.length, matched: metas.size, remaining: left.n };
}

export function resetNotFound() {
  db().prepare("UPDATE games SET enrich_state = 'pending' WHERE enrich_state = 'notfound'").run();
}
