import { isCompetitive, isCoop } from "./session";
import type { Game } from "./types";

export type GenreCategory =
  | "Shooter"
  | "Rollenspiel"
  | "Action"
  | "Abenteuer"
  | "Strategie"
  | "Rennspiel"
  | "Sport"
  | "Kampfspiel"
  | "Plattformer"
  | "Puzzle"
  | "Simulation"
  | "Horror"
  | "Open World"
  | "Roguelike"
  | "Hack & Slash"
  | "Arcade"
  | "Indie"
  | "Musik"
  | "Karten- & Brettspiel"
  | "Survival"
  | "Sci-Fi"
  | "Fantasy"
  | "Stealth"
  | "Party"
  | "Historisch"
  | "Mystery"
  | "Souls-like"
  | "Metroidvania";

export type PlaystyleCategory = "Einzelspieler" | "Koop" | "Mehrspieler (Wettkampf)";

export const PLAYSTYLE_CATEGORIES: readonly PlaystyleCategory[] = [
  "Einzelspieler",
  "Koop",
  "Mehrspieler (Wettkampf)",
];

/**
 * Direkte Zuordnung von normalisierten (kleingeschriebenen) IGDB-Genres und IGDB-Themes
 * zu deutschen Filter-Kategorien. Mehrere IGDB-Bezeichnungen können auf dieselbe Kategorie zeigen.
 */
export const IGDB_GENRE_MAP: Record<string, GenreCategory> = {
  // Shooter
  shooter: "Shooter",
  "shoot 'em up": "Shooter",
  "first-person shooter": "Shooter",
  "third-person shooter": "Shooter",
  "tactical shooter": "Shooter",
  "arena shooter": "Shooter",
  "hero shooter": "Shooter",

  // Rollenspiel
  "role-playing (rpg)": "Rollenspiel",
  rpg: "Rollenspiel",
  "action rpg": "Rollenspiel",
  jrpg: "Rollenspiel",
  mmorpg: "Rollenspiel",
  "tactical rpg": "Rollenspiel",
  "turn-based rpg": "Rollenspiel",

  // Action
  action: "Action",
  "action-adventure": "Action",

  // Abenteuer
  adventure: "Abenteuer",
  "point-and-click": "Abenteuer",
  "visual novel": "Abenteuer",

  // Strategie (inkl. RTS, TBS, Taktik, 4X, MOBA)
  strategy: "Strategie",
  "real time strategy (rts)": "Strategie",
  "turn-based strategy (tbs)": "Strategie",
  tactical: "Strategie",
  "4x (explore, expand, exploit, and exterminate)": "Strategie",
  moba: "Strategie",
  "tower defense": "Strategie",
  "grand strategy": "Strategie",

  // Rennspiel
  racing: "Rennspiel",
  driving: "Rennspiel",

  // Sport
  sport: "Sport",
  sports: "Sport",

  // Kampfspiel
  fighting: "Kampfspiel",

  // Plattformer
  platform: "Plattformer",
  platformer: "Plattformer",

  // Puzzle
  puzzle: "Puzzle",
  "quiz/trivia": "Puzzle",

  // Simulation
  simulator: "Simulation",
  simulation: "Simulation",
  business: "Simulation",

  // Horror
  horror: "Horror",
  thriller: "Horror",
  "survival horror": "Horror",
  "psychological horror": "Horror",

  // Open World
  "open world": "Open World",
  sandbox: "Open World",

  // Roguelike
  roguelike: "Roguelike",
  roguelite: "Roguelike",
  "rogue-like": "Roguelike",
  "rogue-lite": "Roguelike",

  // Hack & Slash
  "hack and slash/beat 'em up": "Hack & Slash",
  "hack and slash": "Hack & Slash",
  "beat 'em up": "Hack & Slash",

  // Arcade
  arcade: "Arcade",
  pinball: "Arcade",

  // Indie
  indie: "Indie",

  // Musik
  music: "Musik",
  rhythm: "Musik",

  // Karten- & Brettspiel
  "card & board game": "Karten- & Brettspiel",
  "card game": "Karten- & Brettspiel",
  "board game": "Karten- & Brettspiel",

  // Survival
  survival: "Survival",

  // Sci-Fi
  "science fiction": "Sci-Fi",
  "sci-fi": "Sci-Fi",

  // Fantasy
  fantasy: "Fantasy",
  "dark fantasy": "Fantasy",

  // Weitere IGDB-Themes / Subgenres
  stealth: "Stealth",
  party: "Party",
  kids: "Party",
  historical: "Historisch",
  mystery: "Mystery",
  "souls-like": "Souls-like",
  soulslike: "Souls-like",
  metroidvania: "Metroidvania",
};

/**
 * Schlagwort-Muster, die zusätzlich in `genres` und `keywords` geprüft werden
 * (z. B. Roguelike/Roguelite, Souls-like, Metroidvania, Deckbuilder).
 */
const KEYWORD_PATTERNS: readonly { pattern: RegExp; category: GenreCategory }[] = [
  { pattern: /\brogue[ -]?(like|lite)\b/i, category: "Roguelike" },
  { pattern: /\bsouls[ -]?like\b/i, category: "Souls-like" },
  { pattern: /\bmetroidvania\b/i, category: "Metroidvania" },
  { pattern: /\b(deck[ -]?building|deckbuilder)\b/i, category: "Karten- & Brettspiel" },
  { pattern: /\bsurvival horror\b/i, category: "Horror" },
];

export interface CategoryCount<T extends string = string> {
  label: T;
  count: number;
}

function hasGenreData(g: Game): boolean {
  return (g.genres?.length ?? 0) > 0 || (g.keywords?.length ?? 0) > 0;
}

/** Ermittelt alle deutschen Genre-Kategorien eines Spiels (ohne Duplikate). */
export function gameGenres(g: Game): GenreCategory[] {
  if (!hasGenreData(g)) return [];
  const found = new Set<GenreCategory>();

  for (const raw of g.genres ?? []) {
    const norm = raw.trim().toLowerCase();
    const mapped = IGDB_GENRE_MAP[norm];
    if (mapped) found.add(mapped);
  }

  const profile = [...(g.genres ?? []), ...(g.keywords ?? [])];
  for (const entry of profile) {
    for (const { pattern, category } of KEYWORD_PATTERNS) {
      if (pattern.test(entry)) {
        found.add(category);
      }
    }
  }

  return [...found];
}

/** Ermittelt die Spielweisen eines Spiels (Einzelspieler, Koop, Mehrspieler (Wettkampf)). */
export function gamePlaystyles(g: Game): PlaystyleCategory[] {
  if (!hasGenreData(g)) return [];
  const profile = [...(g.genres ?? []), ...(g.keywords ?? [])];
  const matches = (re: RegExp) => profile.some((p) => re.test(p));
  const out: PlaystyleCategory[] = [];

  if ((g.modes ?? []).some((m) => /single.?player/i.test(m))) {
    out.push("Einzelspieler");
  }
  if (isCoop(g, matches)) {
    out.push("Koop");
  }
  if (isCompetitive(g, matches)) {
    out.push("Mehrspieler (Wettkampf)");
  }

  return out;
}

/** Alle Filter-Kategorien (Genre + Spielweise) eines Spiels. */
export function gameCategories(g: Game): string[] {
  return [...gameGenres(g), ...gamePlaystyles(g)];
}

/**
 * Prüft, ob ein Spiel zum aktiven Genre-/Spielweise-Filter passt (ODER-Verknüpfung).
 * Spiele ohne Genre-Daten erscheinen bei aktivem Filter nicht.
 */
export function matchesGenreFilter(g: Game, selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  if (!hasGenreData(g)) return false;
  const cats = gameCategories(g);
  return selected.some((s) => cats.includes(s));
}

/** Zählt alle in der Sammlung vorkommenden Genre-Kategorien, absteigend nach Häufigkeit sortiert. */
export function countGenres(games: readonly Game[]): CategoryCount<GenreCategory>[] {
  const counts = new Map<GenreCategory, number>();
  for (const g of games) {
    for (const cat of gameGenres(g)) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));
}

/** Zählt alle in der Sammlung vorkommenden Spielweisen, absteigend nach Häufigkeit sortiert. */
export function countPlaystyles(games: readonly Game[]): CategoryCount<PlaystyleCategory>[] {
  const counts = new Map<PlaystyleCategory, number>();
  for (const g of games) {
    for (const mode of gamePlaystyles(g)) {
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));
}
