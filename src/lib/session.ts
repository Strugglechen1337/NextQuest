import type { Game } from "./types";

export interface SessionAssessment {
  length: "short" | "medium" | "long" | null;
  reason: string;
  savePoints: boolean;
}

export function hasMultiplayer(g: Game): boolean {
  return g.modes.some((m) => /multiplayer|co-operative|battle royale/i.test(m))
    || (g.keywords ?? []).some((k) => /pvp|online multiplayer|competitive|match-based/i.test(k));
}

/** Genres enthalten auch IGDB-Themes; Keywords ergänzen das gesamte Profil. */
export function assessSession(g: Game): SessionAssessment {
  const profile = [...g.genres, ...(g.keywords ?? [])];
  const matches = (re: RegExp) => profile.some((p) => re.test(p));
  const savePoints = matches(/souls.?like|save point|limited sav|survival horror/i)
    || (matches(/horror/i) && matches(/survival/i));
  if (g.sessionPref) return {
    length: g.sessionPref,
    reason: g.sessionPref === "short" ? "Von dir als kurz markiert"
      : g.sessionPref === "medium" ? "Von dir als mittel markiert" : "Von dir als lang markiert",
    savePoints: false,
  };
  const rogue = matches(/rogue[ -]?(like|lite)/i);
  const strong = profile.find((p) => /^(arcade|racing|sport|sports|fighting|card & board game|pinball|party|battle royale)$/i.test(p));
  const mmo = g.modes.some((m) => /massively|mmo/i.test(m)) || matches(/mmorpg|massively multiplayer/i);
  if (mmo) return { length: "long", reason: "Online-Rollenspiel – eher für längere Sessions", savePoints };
  const competitive = g.modes.some((m) => /^(multiplayer|battle royale)$/i.test(m))
    || matches(/arena shooter|battle royale|pvp|online multiplayer|competitive|match-based/i);
  if (rogue || strong || competitive) {
    const signal = rogue ? "Roguelike" : strong ?? "Mehrspieler";
    return { length: "short", reason: `Kurze Runden möglich (${signal})`, savePoints };
  }
  if (matches(/role-playing|open world|horror|survival|strategy|4x|simulator|story.?rich|souls.?like/i)
      || (g.ttbNormally != null && g.ttbNormally > 15 * 60)) {
    return { length: "long", reason: "Story- oder umfangreiches Spiel – eher für längere Sessions", savePoints };
  }
  if (matches(/puzzle|platform|adventure/i)) {
    return { length: "medium", reason: "Eher für eine mittlere Session", savePoints };
  }
  return { length: null, reason: "Session-Länge noch unbekannt", savePoints };
}
