import type { Game } from "./types";
import { significantTags, timeClass } from "./session-learning";

export interface SessionAssessment {
  length: "short" | "medium" | "long" | null;
  reason: string;
  savePoints: boolean;
}

export function hasMultiplayer(g: Game): boolean {
  return g.modes.some((m) => /multiplayer|co-operative|battle royale/i.test(m))
    || (g.keywords ?? []).some((k) => /pvp|online multiplayer|competitive|match-based/i.test(k));
}

type Matcher = (re: RegExp) => boolean;

const hasMode = (g: Game, re: RegExp) => g.modes.some((m) => re.test(m));

/** Koop-Signal: IGDB-Modus „Co-operative“ oder Koop-Schlagwörter. */
export function isCoop(
  g: Game,
  matches: Matcher = (re) => [...g.genres, ...(g.keywords ?? [])].some((p) => re.test(p)),
): boolean {
  return hasMode(g, /co-?operative|co-?op/i) || matches(/\bco-?op\b|cooperative|co-operative/i);
}

/**
 * Echter Wettkampf-Mehrspieler (Matches, die nach Minuten vorbei sind)?
 * IGDB markiert auch reine Koop-Spiele mit „Multiplayer“, deshalb reicht der Modus allein nicht.
 */
export function isCompetitive(
  g: Game,
  matches: Matcher = (re) => [...g.genres, ...(g.keywords ?? [])].some((p) => re.test(p)),
): boolean {
  // 1) Eindeutige Wettkampf-Signale
  if (hasMode(g, /battle royale/i)) return true;
  if (matches(/\bpvp\b|player vs\.? player|competitive|deathmatch|e-?sports?|ranked|arena shooter|hero shooter|match-based|moba|battle royale/i)) return true;
  if (!hasMode(g, /^multiplayer$/i)) return false;
  // 2) Multiplayer + typisches Match-Genre (Shooter, Kampf, Sport, Rennen, MOBA, Echtzeit-Strategie),
  //    aber nicht bei Rollenspielen/Open World (dort ist Multiplayer meist Koop)
  const matchGenre = matches(/^(shooter|fighting|sport|sports|racing|moba|real time strategy \(rts\))$/i);
  const storyGenre = matches(/role-playing|open world|adventure/i);
  if (matchGenre && !storyGenre) return true;
  // 3) Multiplayer ohne Koop- und Story-Hinweise → vermutlich gegeneinander
  return !isCoop(g, matches) && !storyGenre;
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
  if (g.learnedSessionMin) return {
    length: timeClass(g.learnedSessionMin),
    reason: `Du spielst das meist ~${g.learnedSessionMin} Min am Stück`,
    savePoints,
  };
  const tags = significantTags(g.steamTags ?? []);
  const shortTag = tags.find(t => /rogue[ -]?(like|lite)|^(arcade|short|casual|pvp|competitive|battle royale|party)$/i.test(t));
  if (shortTag) return { length: "short", reason: `Kurze Runden möglich (Steam: ${shortTag})`, savePoints };
  const longTag = tags.find(t => /^(story rich|open world|rpg|grand strategy|exploration|long)$/i.test(t));
  if (longTag) return { length: "long", reason: `Längere Sessions (Steam: ${longTag})`, savePoints };
  const rogue = matches(/rogue[ -]?(like|lite)/i);
  const strong = profile.find((p) => /^(arcade|racing|sport|sports|fighting|card & board game|pinball|party|battle royale)$/i.test(p));
  const mmo = g.modes.some((m) => /massively|mmo/i.test(m)) || matches(/mmorpg|massively multiplayer/i);
  if (mmo) return { length: "long", reason: "Online-Rollenspiel – eher für längere Sessions", savePoints };
  const competitive = isCompetitive(g, matches);
  if (rogue || strong || competitive) {
    const signal = rogue ? "Roguelike" : strong ?? "Mehrspieler-Matches";
    return { length: "short", reason: `Kurze Runden möglich (${signal})`, savePoints };
  }
  // Reiner Koop (z. B. It Takes Two, Baldur's Gate 3): gemeinsam durch die Story – Länge wie Einzelspieler
  if (isCoop(g, matches)) {
    const long = matches(/role-playing|open world|survival|story.?rich/i) || (g.ttbNormally != null && g.ttbNormally > 15 * 60);
    return {
      length: long ? "long" : "medium",
      reason: long ? "Koop-Spiel – eher für längere Sessions" : "Koop-Spiel – eher für eine mittlere Session",
      savePoints,
    };
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
