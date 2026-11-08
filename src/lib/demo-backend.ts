import { DEMO } from "./demo-data";
import { matchGames, parseStoreInput } from "./check";
import { normalizeTitle } from "./normalize-title";
import { computeYearReview } from "./year-review";
import { parseGoals, validateGoalInput, validateGoalsJson } from "./goals";
import { timeClass } from "./session-learning";
import { PLATFORMS, type PlatformId } from "./platforms";
import type { Game, Ownership } from "./types";

const KEY = "nextquest-demo-v1";
type State = { games: Game[]; goals: string | null };
let memory: State | null = null;
function initial(): State {
  let oid = 0;
  return { goals: null, games: DEMO.map((d, index) => {
    const ownerships: Ownership[] = d.on.map(([platform, hours]) => ({ id: ++oid, platform, externalId: platform === "steam" && d.steam ? String(d.steam) : `demo-${platform}-${d.title}`, title: d.title, playtimeMin: hours * 60, lastPlayed: hours ? new Date(Date.now() - (index + 1) * 86400000).toISOString() : null, source: "demo" }));
    const copies = ownerships.filter(o => !PLATFORMS[o.platform].subscription).length;
    return { id: index + 1, title: d.title, igdbId: null, coverUrl: d.steam ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${d.steam}/library_600x900.jpg` : null, rating: d.rating, ratingCount: d.votes, genres: d.genres, modes: d.modes ?? ["Single player"], keywords: [], sessionPref: null, ttbHastily: d.ttb[0] * 60, ttbNormally: d.ttb[1] * 60, ttbCompletely: d.ttb[2] * 60, releaseYear: d.year, summary: null, summaryDe: null, completed: false, status: "open", createdAt: new Date().toISOString(), enrichState: "done", ownerships, playtimeMin: ownerships.reduce((n, o) => n + o.playtimeMin, 0), lastPlayed: ownerships.find(o => o.lastPlayed)?.lastPlayed ?? null, copies, inGamePass: ownerships.some(o => o.platform === "gamepass"), owned: copies > 0 };
  }) };
}
function state(): State {
  if (memory) return memory;
  try { const saved = localStorage.getItem(KEY); if (saved) { const parsed = JSON.parse(saved) as State; if (Array.isArray(parsed.games)) return memory = parsed; } } catch { /* storage unavailable */ }
  return memory = initial();
}
function save(s: State) { memory = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* keep state in memory */ } }
export function resetDemo() { memory = initial(); save(memory); }
export function demoApi(url: string, init?: { method?: string; body?: unknown }): unknown {
  const s = state(); const u = new URL(url, "https://demo.invalid"); const method = init?.method ?? (init?.body !== undefined ? "POST" : "GET");
  const body = (init?.body ?? {}) as Record<string, unknown>;
  if (u.pathname === "/api/library") return { games: s.games, stats: { total: s.games.length, owned: s.games.filter(g => g.owned).length, duplicates: s.games.filter(g => g.copies > 1).length, completed: s.games.filter(g => g.completed).length, playtimeMin: s.games.reduce((n, g) => n + g.playtimeMin, 0), gamePassOnly: s.games.filter(g => !g.owned && g.inGamePass).length, pendingEnrich: 0 }, settings: { goals: s.goals, "gamepass.enabled": "1" }, igdb: false };
  if (u.pathname === "/api/stats/year") {
    const year = new Date().getUTCFullYear();
    const unlocks = s.games.flatMap(g => g.ownerships.filter(o => o.playtimeMin > 0).flatMap(o => [
      { game_id: g.id, platform: o.platform, external_id: "demo-current", unlocked_at: `${year}-02-01T00:00:00Z` },
      { game_id: g.id, platform: o.platform, external_id: "demo-previous", unlocked_at: `${year - 1}-02-01T00:00:00Z` },
    ]));
    return { games: s.games, snapshots: [], unlocks, review: computeYearReview(s.games, [], Number(u.searchParams.get("year")) || undefined, new Date(), unlocks), igdb: false };
  }
  if (u.pathname === "/api/check") { const input = parseStoreInput(u.searchParams.get("q") ?? ""); return { query: input.title, unresolved: !!input.kind, ...matchGames(s.games, input, normalizeTitle) }; }
  if (u.pathname === "/api/demo") { resetDemo(); return { count: state().games.length }; }
  if (u.pathname === "/api/goals") {
    let goals = parseGoals(s.goals);
    if (method === "DELETE") goals = body.all ? [] : goals.filter(g => g.id !== (u.searchParams.get("id") ?? body.id));
    else if (method !== "GET") { if (Array.isArray(init?.body) || Array.isArray(body.goals)) goals = JSON.parse(validateGoalsJson(Array.isArray(init?.body) ? init.body : body.goals)); else { const goal = validateGoalInput(body); goals = [...goals.filter(g => g.id !== goal.id), goal]; } }
    s.goals = goals.length ? validateGoalsJson(goals) : null; save(s); return { goals };
  }
  if (u.pathname === "/api/games" && method === "POST") {
    const title = String(body.title ?? "").trim(); const platform = body.platform as PlatformId;
    if (!title || !PLATFORMS[platform]?.manual) throw new Error("Bitte Titel und Plattform angeben.");
    const id = Math.max(0, ...s.games.map(g => g.id)) + 1; const oid = Math.max(0, ...s.games.flatMap(g => g.ownerships.map(o => o.id))) + 1; const minutes = Math.max(0, Number(body.playtimeHours) || 0) * 60;
    const ownership: Ownership = { id: oid, platform, externalId: `manual-${id}`, title, playtimeMin: minutes, lastPlayed: null, firstSeen: new Date().toISOString(), source: "manual" };
    s.games.push({ id, title, igdbId: null, coverUrl: null, rating: null, ratingCount: null, genres: [], modes: [], keywords: [], sessionPref: null, ttbHastily: null, ttbNormally: null, ttbCompletely: null, releaseYear: null, summary: null, summaryDe: null, completed: false, status: "open", createdAt: new Date().toISOString(), enrichState: "manual", ownerships: [ownership], playtimeMin: minutes, lastPlayed: null, copies: 1, inGamePass: false, owned: true }); save(s); return { id };
  }
  const match = u.pathname.match(/^\/api\/games\/(\d+)(\/feedback)?$/);
  if (match) { const g = s.games.find(x => x.id === Number(match[1])); if (!g) throw new Error("Spiel nicht gefunden.");
    if (match[2]) { if (method === "DELETE") g.timeFeedback = {}; else { const minutes = Number(body.minutes), value = Number(body.value); if (!(minutes > 0) || ![-1, 1].includes(value)) throw new Error("Ungültiges Zeit-Feedback"); g.timeFeedback = { ...g.timeFeedback, [timeClass(minutes)]: value }; } }
    else { if (typeof body.completed === "boolean") { g.completed = body.completed; g.status = body.completed ? "completed" : "open"; g.completedAt = body.completed ? new Date().toISOString() : null; } if (typeof body.status === "string") { g.status = body.status as Game["status"]; g.completed = body.status === "completed"; g.completedAt = g.completed ? new Date().toISOString() : null; } if ("completedOn" in body) g.completedOn = body.completedOn as string | null; if ("userNote" in body) g.userNote = body.userNote as string | null; if ("userRating" in body) g.userRating = body.userRating as number | null; if ("sessionPref" in body) g.sessionPref = body.sessionPref as Game["sessionPref"]; if (body.meta && typeof body.meta === "object") Object.assign(g, body.meta); }
    save(s); return { id: g.id, ok: true };
  }
  throw new Error("Diese Funktion ist in der Demo nicht verfügbar.");
}
