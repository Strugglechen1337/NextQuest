import { getStoryProgressPercent } from "./stats";
import { formatMinutes } from "./suggest";
import type { Game } from "./types";

export type GoalKind = "complete_count" | "reduce_pile" | "complete_game";
export type GoalPeriod = "month" | "year" | "custom";

export interface Goal {
  id: string;
  kind: GoalKind;
  title: string;
  targetCount: number;
  period?: GoalPeriod;
  /** Startdatum im Format YYYY-MM-DD */
  startDate: string;
  /** Frist / Enddatum im Format YYYY-MM-DD */
  deadline: string;
  /** Für complete_game: Spiel-ID aus der Bibliothek */
  gameId?: number | null;
  /** Gespeicherter Spieltitel als Rückfallwert */
  gameTitle?: string | null;
  /** Für reduce_pile: Ausgangsgröße des Pile of Shame beim Anlegen */
  baselinePileCount?: number | null;
  /** Für reduce_pile: Optionale IDs der beim Anlegen ungespielten offenen Spiele */
  baselinePileGameIds?: number[];
  createdAt: string;
}

export type GoalStatus = "open" | "achieved" | "failed";

export interface GoalProgress {
  goal: Goal;
  current: number;
  target: number;
  /** Fortschritt in Prozent (0..100) für den Fortschrittsbalken */
  percent: number;
  status: GoalStatus;
  isExpired: boolean;
  isHistory: boolean;
  resultLabel: "✓ geschafft" | "✗ verpasst" | "Offen";
  progressLabel: string;
  subLabel: string;
  matchedGames: Game[];
  targetGame: Game | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Extrahiert YYYY-MM-DD aus beliebigen Datums-/Zeitstrings (SQLite datetime, ISO, YYYY-MM-DD). */
export function toDateKey(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length >= 10 && DATE_RE.test(trimmed.slice(0, 10))) {
    return trimmed.slice(0, 10);
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Formatiert YYYY-MM-DD (oder ISO-String) als deutsches Datum TT.MM.JJJJ. */
export function formatDateDe(value: string | null | undefined): string {
  const key = toDateKey(value);
  if (!key) return "–";
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function monthStartEnd(now: Date = new Date()): { startDate: string; deadline: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, "0");
  return {
    startDate: `${y}-${mm}-01`,
    deadline: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function yearStartEnd(now: Date = new Date()): { startDate: string; deadline: string } {
  const y = now.getUTCFullYear();
  return {
    startDate: `${y}-01-01`,
    deadline: `${y}-12-31`,
  };
}

function isGameCompleted(g: Game): boolean {
  return g.completed || g.status === "completed";
}

/** Zählt offene, noch nie gespielte Spiele (Pile of Shame). */
export function countPileOfShame(games: readonly Game[]): number {
  return games.filter((g) => !isGameCompleted(g) && g.playtimeMin === 0).length;
}

export function getPileOfShameGameIds(games: readonly Game[]): number[] {
  return games.filter((g) => !isGameCompleted(g) && g.playtimeMin === 0).map((g) => g.id);
}

/** Erzeugt einen sprechenden deutschen Standardtitel für ein Ziel. */
export function defaultGoalTitle(input: {
  kind: GoalKind;
  targetCount: number;
  period?: GoalPeriod;
  deadline: string;
  gameTitle?: string | null;
}): string {
  const count = input.targetCount;
  const spieleWort = count === 1 ? "Spiel" : "Spiele";
  if (input.kind === "complete_count") {
    if (input.period === "month") return `Diesen Monat ${count} ${spieleWort} durchspielen`;
    if (input.period === "year") return `Dieses Jahr ${count} ${spieleWort} durchspielen`;
    return `${count} ${spieleWort} bis ${formatDateDe(input.deadline)} durchspielen`;
  }
  if (input.kind === "reduce_pile") {
    return `Pile of Shame um ${count} ${spieleWort} verkleinern`;
  }
  const name = input.gameTitle?.trim() || "Ausgewähltes Spiel";
  return `„${name}“ bis ${formatDateDe(input.deadline)} durchspielen`;
}

/** Validiert ein einzelnes Ziel-Objekt strikt und gibt ein bereinigtes Goal zurück. */
export function validateGoalInput(raw: unknown, fallbackNow: Date = new Date()): Goal {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Ungültiges Ziel-Format.");
  }
  const obj = raw as Record<string, unknown>;

  const kind = obj.kind;
  if (kind !== "complete_count" && kind !== "reduce_pile" && kind !== "complete_game") {
    throw new Error("Ungültige Ziel-Art.");
  }

  const id =
    typeof obj.id === "string" && obj.id.trim().length > 0
      ? obj.id.trim().slice(0, 64)
      : `goal-${fallbackNow.getTime()}-${Math.random().toString(36).slice(2, 8)}`;

  const period: GoalPeriod | undefined =
    obj.period === "month" || obj.period === "year" || obj.period === "custom" ? obj.period : undefined;

  const todayKey = toDateKey(fallbackNow.toISOString())!;
  const startDate = typeof obj.startDate === "string" && isValidDateKey(obj.startDate) ? obj.startDate : todayKey;
  const deadline = typeof obj.deadline === "string" && isValidDateKey(obj.deadline) ? obj.deadline : "";

  if (!deadline) {
    throw new Error("Bitte ein gültiges Frist-Datum (JJJJ-MM-TT) angeben.");
  }
  if (deadline < startDate) {
    throw new Error("Das Enddatum darf nicht vor dem Startdatum liegen.");
  }

  let targetCount = 1;
  if (kind === "complete_game") {
    targetCount = 1;
  } else {
    const num = Number(obj.targetCount);
    if (!Number.isInteger(num) || num < 1 || num > 10000) {
      throw new Error("Die Ziel-Anzahl muss eine ganze Zahl zwischen 1 und 10000 sein.");
    }
    targetCount = num;
  }

  let gameId: number | null = null;
  let gameTitle: string | null = null;
  if (kind === "complete_game") {
    const gid = Number(obj.gameId);
    if (!Number.isInteger(gid) || gid <= 0) {
      throw new Error("Bitte ein Spiel aus der Bibliothek auswählen.");
    }
    gameId = gid;
    if (typeof obj.gameTitle === "string" && obj.gameTitle.trim()) {
      gameTitle = obj.gameTitle.trim().slice(0, 200);
    }
  }

  let baselinePileCount: number | null = null;
  let baselinePileGameIds: number[] | undefined;
  if (kind === "reduce_pile") {
    if (obj.baselinePileCount !== undefined && obj.baselinePileCount !== null) {
      const b = Number(obj.baselinePileCount);
      if (!Number.isInteger(b) || b < 0 || b > 100000) {
        throw new Error("Ungültiger Ausgangswert für den Pile of Shame.");
      }
      baselinePileCount = b;
    } else {
      baselinePileCount = 0;
    }
    if (Array.isArray(obj.baselinePileGameIds)) {
      baselinePileGameIds = obj.baselinePileGameIds
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 5000);
    }
  }

  const rawTitle = typeof obj.title === "string" ? obj.title.trim() : "";
  if (rawTitle.length > 200) {
    throw new Error("Der Ziel-Titel darf maximal 200 Zeichen lang sein.");
  }
  const title =
    rawTitle ||
    defaultGoalTitle({
      kind,
      targetCount,
      period,
      deadline,
      gameTitle,
    });

  const createdAt =
    typeof obj.createdAt === "string" && toDateKey(obj.createdAt)
      ? obj.createdAt
      : fallbackNow.toISOString();

  const out: Goal = {
    id,
    kind,
    title,
    targetCount,
    startDate,
    deadline,
    createdAt,
  };
  if (period) out.period = period;
  if (kind === "complete_game") {
    out.gameId = gameId;
    if (gameTitle) out.gameTitle = gameTitle;
  }
  if (kind === "reduce_pile") {
    out.baselinePileCount = baselinePileCount;
    if (baselinePileGameIds) out.baselinePileGameIds = baselinePileGameIds;
  }
  return out;
}

/** Validiert eine Liste von Zielen (als JSON-String oder Array) und gibt den kanonischen JSON-String zurück. */
export function validateGoalsJson(input: unknown, fallbackNow: Date = new Date()): string {
  let parsed: unknown = input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return "[]";
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("Ungültiges JSON-Format für Ziele.");
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Ziele müssen als Liste übergeben werden.");
  }
  if (parsed.length > 100) {
    throw new Error("Maximal 100 Ziele erlaubt.");
  }
  const seenIds = new Set<string>();
  const validated: Goal[] = [];
  for (const item of parsed) {
    const goal = validateGoalInput(item, fallbackNow);
    if (seenIds.has(goal.id)) {
      throw new Error(`Doppelte Ziel-ID: ${goal.id}`);
    }
    seenIds.add(goal.id);
    validated.push(goal);
  }
  return JSON.stringify(validated);
}

/** Liest gespeicherte Ziele fehlertolerant aus dem Settings-String. */
export function parseGoals(raw: string | null | undefined): Goal[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Goal[] = [];
    for (const item of parsed) {
      try {
        out.push(validateGoalInput(item));
      } catch {
        // Beschädigte Einzeleinträge überspringen
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Ermittelt das Abschlussdatum (YYYY-MM-DD) eines durchgespielten Spiels aus vorhandenen Feldern. */
export function getGameCompletionDateKey(game: Game): string | null {
  if (!isGameCompleted(game)) return null;
  return toDateKey(game.completedOn) ?? toDateKey(game.completedAt) ?? toDateKey(game.lastPlayed) ?? toDateKey(game.createdAt);
}

function formatDeadlineSubLabel(deadline: string, isExpired: boolean, status: GoalStatus, nowKey: string): string {
  const formatted = formatDateDe(deadline);
  if (status === "achieved") {
    return `Frist: ${formatted} · Ziel erreicht`;
  }
  if (isExpired) {
    return `Frist abgelaufen am ${formatted}`;
  }
  const [y1, m1, d1] = nowKey.split("-").map(Number);
  const [y2, m2, d2] = deadline.split("-").map(Number);
  const ms1 = Date.UTC(y1, m1 - 1, d1);
  const ms2 = Date.UTC(y2, m2 - 1, d2);
  const daysLeft = Math.max(0, Math.round((ms2 - ms1) / 86_400_000));
  if (daysLeft === 0) return `Bis heute (${formatted})`;
  if (daysLeft === 1) return `Bis ${formatted} · noch 1 Tag`;
  return `Bis ${formatted} · noch ${daysLeft} Tage`;
}

/** Berechnet den aktuellen Fortschritt eines Ziels automatisch aus den Bibliotheksdaten. */
export function evaluateGoal(goal: Goal, games: readonly Game[], now: Date = new Date()): GoalProgress {
  const nowKey = toDateKey(now.toISOString())!;
  const isExpired = nowKey > goal.deadline;

  if (goal.kind === "complete_count") {
    const matchedGames = games.filter((g) => {
      if (!isGameCompleted(g)) return false;
      const compDate = getGameCompletionDateKey(g);
      if (!compDate) return false;
      return compDate >= goal.startDate && compDate <= goal.deadline;
    });
    const current = matchedGames.length;
    const target = goal.targetCount;
    const achieved = current >= target;
    const status: GoalStatus = achieved ? "achieved" : isExpired ? "failed" : "open";
    const percent = Math.min(100, Math.round((current / Math.max(1, target)) * 100));
    const spieleWort = target === 1 ? "Spiel" : "Spiele";
    return {
      goal,
      current,
      target,
      percent,
      status,
      isExpired,
      isHistory: status === "achieved" || status === "failed",
      resultLabel: status === "achieved" ? "✓ geschafft" : status === "failed" ? "✗ verpasst" : "Offen",
      progressLabel: `${current} / ${target} ${spieleWort} durchgespielt`,
      subLabel: formatDeadlineSubLabel(goal.deadline, isExpired, status, nowKey),
      matchedGames,
      targetGame: null,
    };
  }

  if (goal.kind === "reduce_pile") {
    const currentPile = countPileOfShame(games);
    const baseline = goal.baselinePileCount ?? currentPile;
    const diffFromCount = Math.max(0, baseline - currentPile);

    let matchedFromBaseline: Game[] = [];
    if (goal.baselinePileGameIds && goal.baselinePileGameIds.length > 0) {
      const idSet = new Set(goal.baselinePileGameIds);
      matchedFromBaseline = games.filter(
        (g) => idSet.has(g.id) && (g.playtimeMin > 0 || isGameCompleted(g)),
      );
    } else {
      matchedFromBaseline = games.filter((g) => {
        if (g.playtimeMin <= 0 && !isGameCompleted(g)) return false;
        const activeDate = getGameCompletionDateKey(g) ?? toDateKey(g.lastPlayed);
        return !!activeDate && activeDate >= goal.startDate && activeDate <= goal.deadline;
      });
    }

    const current = Math.max(diffFromCount, matchedFromBaseline.length);
    const target = goal.targetCount;
    const achieved = current >= target;
    const status: GoalStatus = achieved ? "achieved" : isExpired ? "failed" : "open";
    const percent = Math.min(100, Math.round((current / Math.max(1, target)) * 100));
    const spieleWort = target === 1 ? "Spiel" : "Spiele";

    return {
      goal,
      current,
      target,
      percent,
      status,
      isExpired,
      isHistory: status === "achieved" || status === "failed",
      resultLabel: status === "achieved" ? "✓ geschafft" : status === "failed" ? "✗ verpasst" : "Offen",
      progressLabel: `${current} / ${target} ${spieleWort} abgebaut (aktuell ${currentPile} ungespielt)`,
      subLabel: formatDeadlineSubLabel(goal.deadline, isExpired, status, nowKey),
      matchedGames: matchedFromBaseline,
      targetGame: null,
    };
  }

  // complete_game
  const targetGame = games.find((g) => g.id === goal.gameId) ?? null;
  const completed = targetGame ? isGameCompleted(targetGame) : false;
  const compDate = targetGame ? getGameCompletionDateKey(targetGame) : null;
  const completedInTime = completed && (!compDate || compDate <= goal.deadline);

  const current = completedInTime ? 1 : 0;
  const target = 1;
  const status: GoalStatus = completedInTime ? "achieved" : isExpired ? "failed" : "open";

  let percent = completedInTime ? 100 : 0;
  let progressDetails = "Noch nicht begonnen";

  if (targetGame) {
    if (completedInTime) {
      progressDetails = compDate
        ? `Durchgespielt am ${formatDateDe(compDate)}`
        : `Durchgespielt (${formatMinutes(targetGame.playtimeMin)})`;
    } else {
      const storyPct = getStoryProgressPercent(targetGame);
      const ownershipPct = Math.max(
        0,
        ...targetGame.ownerships.map((o) => (typeof o.progressPct === "number" ? Math.round(o.progressPct) : 0)),
      );
      if (storyPct !== null && storyPct > 0) {
        percent = storyPct;
        progressDetails = `${formatMinutes(targetGame.playtimeMin)} gespielt · ca. ${storyPct} % Hauptstory`;
      } else if (ownershipPct > 0) {
        percent = Math.min(99, ownershipPct);
        progressDetails = `${formatMinutes(targetGame.playtimeMin)} gespielt · ${ownershipPct} % Erfolge`;
      } else if (targetGame.playtimeMin > 0) {
        percent = 25;
        progressDetails = `${formatMinutes(targetGame.playtimeMin)} gespielt`;
      }
    }
  } else {
    progressDetails = "Spiel nicht mehr in der Bibliothek";
  }

  return {
    goal,
    current,
    target,
    percent,
    status,
    isExpired,
    isHistory: status === "achieved" || status === "failed",
    resultLabel: status === "achieved" ? "✓ geschafft" : status === "failed" ? "✗ verpasst" : "Offen",
    progressLabel: progressDetails,
    subLabel: formatDeadlineSubLabel(goal.deadline, isExpired, status, nowKey),
    matchedGames: completedInTime && targetGame ? [targetGame] : [],
    targetGame,
  };
}

export function evaluateAllGoals(
  goals: readonly Goal[],
  games: readonly Game[],
  now: Date = new Date(),
): {
  all: GoalProgress[];
  active: GoalProgress[];
  history: GoalProgress[];
} {
  const all = goals.map((g) => evaluateGoal(g, games, now));
  const active = all.filter((p) => !p.isHistory);
  const history = all.filter((p) => p.isHistory);
  return { all, active, history };
}
