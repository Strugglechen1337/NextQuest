import type { Game } from "./types";
import { assessSession, hasMultiplayer } from "./session";
import { timeClass } from "./session-learning";

export function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return "–";
  if (min < 60) return `${min} Min`;
  const h = min / 60;
  if (h < 10) return `${h.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std`;
  return `${Math.round(h).toLocaleString("de-DE")} Std`;
}

export interface Suggestion {
  game: Game;
  score: number;
  reasons: string[];
}

export function isCandidate(g: Game, includeGamePass: boolean) {
  return !g.completed && g.status !== "abandoned" && g.status !== "completed" && (g.owned || (includeGamePass && g.inGamePass));
}

/**
 * Bewertet Spiele danach, wie gut sie zur verfügbaren Zeit passen.
 * `jitter` mischt etwas Zufall hinein, damit „Neu würfeln“ andere Vorschläge bringt.
 */
export function suggestForTime(
  games: Game[],
  minutes: number,
  includeGamePass: boolean,
  jitter = 0,
  limit: number | null = 6,
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const g of games) {
    if (!isCandidate(g, includeGamePass)) continue;
    let score = 0;
    const reasons: string[] = [];
    if (g.status === "wanted" || g.status === "playing") score += 7;
    if (includeGamePass && g.ownerships.some(o => o.platform === "gamepass" && o.leavingSoon)) { score += 8; reasons.push("Verlässt bald den Game Pass"); }

    if (g.rating) score += ((g.rating - 70) / 30) * 15;
    if (g.ratingCount) score += Math.log10(g.ratingCount + 1) * 3;

    const total = g.ttbNormally;
    const played = g.playtimeMin;
    const started = played > 0;

    const session = assessSession(g);
    const unreliableProgress = hasMultiplayer(g) && !!total && played >= total * 0.8;
    const sessionFits = !g.sessionPref || (g.sessionPref === "short" || (g.sessionPref === "medium" ? minutes >= 60 : minutes >= 120));

    if (total && !unreliableProgress && sessionFits && !(session.savePoints && minutes < 45)) {
      const remaining = Math.max(total - played, 0);
      if (!started && total <= minutes * 1.15) {
        score += 40;
        reasons.push(`Hauptstory laut IGDB: ca. ${formatMinutes(total)}`);
      } else if (started && remaining > 0 && remaining <= minutes * 1.15) {
        score += 38;
        reasons.push(`Geschätzt noch ca. ${formatMinutes(remaining)} Hauptstory (Spielzeit-Abgleich)`);
      } else if (!g.sessionPref && minutes < 60 && total > 40 * 60 && !started) {
        score -= 12;
      }
    }

    reasons.push(session.reason);
    if (!g.sessionPref && g.learnedSessionMin && g.learnedSessionMin <= minutes * 1.15) score += 20;
    const feedback = g.timeFeedback?.[timeClass(minutes)];
    if (feedback === -1) { score -= 60; reasons.push("Für diese Zeit von dir abgewertet"); }
    if (feedback === 1) { score += 10; reasons.push("Passt für diese Zeit laut deinem Feedback"); }
    if (session.length === "short") score += minutes <= 60 ? 25 : 6;
    if (session.length === "medium") score += minutes >= 60 ? 16 : -12;
    if (session.length === "long") score += minutes < 45 ? -24 : minutes >= 120 ? 20 : -6;
    if (session.savePoints && minutes < 45) {
      score -= 20;
      reasons.push("Möglicherweise Speichern nur an Speicherpunkten – plane mehr Zeit ein");
    }

    if (started && (!total || played < total)) {
      if (minutes >= 45) {
        score += 15;
        reasons.push(`Du bist schon drin (${formatMinutes(played)} gespielt)`);
      } else score += 5;
    }

    if (!g.owned && g.inGamePass) reasons.push("Im Game Pass enthalten");
    if (g.modes.some((m) => /multiplayer|co-operative/i.test(m)) && minutes <= 60) score += 4;
    if (jitter) score += Math.random() * jitter;

    if (!reasons.length && g.rating && g.rating >= 85) reasons.push("Sehr gut bewertet");
    out.push({ game: g, score, reasons });
  }
  out.sort((a, b) => b.score - a.score);
  return limit === null ? out : out.slice(0, limit);
}

/**
 * „Andere Vorschläge“: zieht neue, noch nicht gezeigte Spiele aus allen gut passenden Kandidaten.
 * Bessere Treffer sind wahrscheinlicher, aber nicht garantiert. Sind alle passenden Spiele schon
 * einmal gezeigt worden, beginnt die Runde von vorn (`reset: true`).
 */
export function rerollForTime(
  games: Game[],
  minutes: number,
  includeGamePass: boolean,
  shown: Set<number>,
): { items: Suggestion[]; reset: boolean } {
  const all = suggestForTime(games, minutes, includeGamePass, 0, null);
  if (!all.length) return { items: [], reset: false };
  const best = all[0].score;
  // Pool: alle Spiele, die halbwegs passen (bis 35 Punkte unter dem besten), mindestens die besten 24, höchstens 120
  const pool = all.filter((s, i) => i < 24 || s.score >= best - 35).slice(0, 120);
  const fresh = pool.filter((s) => !shown.has(s.game.id));
  // Kaum noch Neues übrig → neue Runde mit allen passenden Spielen
  const reset = fresh.length < 3;
  const picked = weightedSample(reset ? pool : fresh, 6);
  // Weniger als 6 neue Spiele übrig: mit bereits gezeigten auffüllen
  if (picked.length < 6) {
    const rest = pool.filter((s) => !picked.includes(s));
    picked.push(...weightedSample(rest, 6 - picked.length));
  }
  return { items: picked.sort((a, b) => b.score - a.score), reset };
}

/** Gewichtete Zufallsauswahl ohne Zurücklegen – höhere Punktzahl = wahrscheinlicher. */
function weightedSample(list: Suggestion[], n: number): Suggestion[] {
  const bag = [...list];
  const picked: Suggestion[] = [];
  while (picked.length < n && bag.length) {
    const min = Math.min(...bag.map((s) => s.score));
    const weights = bag.map((s) => s.score - min + 10);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < bag.length - 1 && r > weights[i]) r -= weights[i++];
    picked.push(bag.splice(i, 1)[0]);
  }
  return picked;
}

export function randomPick(games: Game[], includeGamePass: boolean, avoidId?: number): Game | null {
  const all = games.filter((g) => isCandidate(g, includeGamePass));
  const c = all.length > 1 && avoidId !== undefined ? all.filter((g) => g.id !== avoidId) : all;
  return c.length ? c[Math.floor(Math.random() * c.length)] : null;
}
