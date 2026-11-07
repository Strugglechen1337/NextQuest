import type { Game } from "./types";

const SESSION_GENRES = [
  "Roguelike",
  "Racing",
  "Sport",
  "Fighting",
  "Puzzle",
  "Arcade",
  "Card & Board Game",
  "Pinball",
  "Music",
  "Platform",
  "Party",
];
const LONG_GENRES = ["Role-playing (RPG)", "Open world", "Strategy", "Simulator", "Turn-based strategy (TBS)"];

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

const has = (g: Game, list: string[]) => g.genres.some((x) => list.includes(x));

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

    if (total) {
      const remaining = Math.max(total - played, 0);
      if (!started && total <= minutes * 1.15) {
        score += 40;
        reasons.push(`In ca. ${formatMinutes(total)} komplett durchspielbar`);
      } else if (started && remaining > 0 && remaining <= minutes * 1.15) {
        score += 38;
        reasons.push(`Nur noch ca. ${formatMinutes(remaining)} bis zum Ende`);
      } else if (minutes < 60 && total > 40 * 60 && !started) {
        score -= 12;
      }
    }

    if (has(g, SESSION_GENRES)) {
      if (minutes <= 60) {
        score += 25;
        reasons.push("Perfekt für eine kurze Runde");
      } else score += 6;
    }

    if (has(g, LONG_GENRES)) {
      if (minutes < 45) score -= 18;
      else if (minutes >= 120) {
        score += 16;
        reasons.push("Ideal für eine lange Session");
      }
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
