import type { Game } from "./types";
import { assessSession, hasMultiplayer } from "./session";

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
  return !g.completed && (g.owned || (includeGamePass && g.inGamePass));
}

/**
 * Bewertet Spiele danach, wie gut sie zur verfügbaren Zeit passen.
 * `jitter` mischt etwas Zufall hinein, damit „Neu würfeln“ andere Vorschläge bringt.
 */
export function suggestForTime(games: Game[], minutes: number, includeGamePass: boolean, jitter = 0): Suggestion[] {
  const out: Suggestion[] = [];
  for (const g of games) {
    if (!isCandidate(g, includeGamePass)) continue;
    let score = 0;
    const reasons: string[] = [];

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
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}

export function randomPick(games: Game[], includeGamePass: boolean): Game | null {
  const c = games.filter((g) => isCandidate(g, includeGamePass));
  return c.length ? c[Math.floor(Math.random() * c.length)] : null;
}
