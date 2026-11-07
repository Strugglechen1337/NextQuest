import { gameGenres, type GenreCategory } from "./genres";
import { formatDateDe, getGameCompletionDateKey, toDateKey } from "./goals";
import { PLATFORM_ORDER, PLATFORMS, type PlatformId } from "./platforms";
import type { Game } from "./types";

export interface PlaytimeSnapshotRow {
  id?: number;
  game_id: number;
  platform: string;
  taken_at: string;
  playtime_min: number;
}

export interface YearCompletedGame {
  game: Game;
  completedDate: string;
  completedDateLabel: string;
  playtimeMin: number;
  /** Maßgebliche Dauer für Längstes/Kürzestes Spiel (gespielte Minuten oder IGDB ttbNormally) */
  durationMin: number;
}

export interface YearGenreStat {
  genre: GenreCategory;
  playtimeMin: number;
  gameCount: number;
  completedCount: number;
  sharePercent: number;
}

export interface YearPlatformStat {
  platform: PlatformId;
  label: string;
  short: string;
  color: string;
  playtimeMin: number;
  gameCount: number;
  sharePercent: number;
}

export interface YearMonthStat {
  monthIndex: number;
  label: string;
  fullLabel: string;
  activeCount: number;
  completedCount: number;
  playtimeMin: number;
}

export interface YearReviewData {
  year: number;
  availableYears: number[];
  /** "snapshots" wenn echte Zuwächse aus playtime_snapshots im Jahr vorliegen, sonst "total" („Gesamt“) */
  playtimeMode: "snapshots" | "total";
  /** Gespielte Minuten im Jahr (aus Snapshots) bzw. Gesamtspielzeit der im Jahr aktiven Spiele */
  playtimeMin: number;
  /** Gesamte Spielzeit der gesamten Bibliothek als Referenz */
  libraryTotalPlaytimeMin: number;
  activeGamesCount: number;
  completedGames: YearCompletedGame[];
  longestCompleted: YearCompletedGame | null;
  shortestCompleted: YearCompletedGame | null;
  mostPlayedGame: {
    game: Game;
    playtimeMin: number;
    isSnapshotDelta: boolean;
  } | null;
  topGenre: YearGenreStat | null;
  genres: YearGenreStat[];
  topPlatform: YearPlatformStat | null;
  platforms: YearPlatformStat[];
  newGamesCount: number;
  newGames: Game[];
  byMonth: YearMonthStat[];
  collageGames: Game[];
}

const MONTH_SHORT_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTH_FULL_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function extractYear(dateStr: string | null | undefined): number | null {
  const key = toDateKey(dateStr);
  if (!key) return null;
  const y = Number(key.slice(0, 4));
  return Number.isInteger(y) && y >= 1970 && y <= 2100 ? y : null;
}

export function extractMonthIndex(dateStr: string | null | undefined): number | null {
  const key = toDateKey(dateStr);
  if (!key) return null;
  const m = Number(key.slice(5, 7));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m - 1 : null;
}

export function computeYearReview(
  games: readonly Game[],
  snapshots: readonly PlaytimeSnapshotRow[] = [],
  requestedYear?: number | null,
  now: Date = new Date(),
): YearReviewData {
  const currentYear = now.getUTCFullYear();
  const yearsSet = new Set<number>([currentYear]);

  for (const g of games) {
    const yc = extractYear(g.completedAt);
    const yl = extractYear(g.lastPlayed);
    const ycr = extractYear(g.createdAt);
    if (yc) yearsSet.add(yc);
    if (yl) yearsSet.add(yl);
    if (ycr) yearsSet.add(ycr);
    for (const o of g.ownerships) {
      const yo = extractYear(o.lastPlayed);
      if (yo) yearsSet.add(yo);
    }
  }
  for (const s of snapshots) {
    const ys = extractYear(s.taken_at);
    if (ys) yearsSet.add(ys);
  }
  if (requestedYear && Number.isInteger(requestedYear) && requestedYear >= 1970 && requestedYear <= 2100) {
    yearsSet.add(requestedYear);
  }

  const availableYears = [...yearsSet].sort((a, b) => b - a);
  const year =
    requestedYear && yearsSet.has(requestedYear) ? requestedYear : (availableYears[0] ?? currentYear);

  // 1. Spielzeit-Zuwächse im gewählten Jahr aus playtime_snapshots ableiten
  const groupedSnapshots = new Map<string, PlaytimeSnapshotRow[]>();
  for (const s of snapshots) {
    const key = `${s.game_id}:${s.platform}`;
    const list = groupedSnapshots.get(key) ?? [];
    list.push(s);
    groupedSnapshots.set(key, list);
  }

  const snapshotDeltaByGame = new Map<number, number>();
  const snapshotDeltaByPlatform = new Map<PlatformId, number>();
  const snapshotGamesByPlatform = new Map<PlatformId, Set<number>>();
  const snapshotDeltaByMonth = new Array<number>(12).fill(0);

  for (const list of groupedSnapshots.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => {
      const ta = toDateKey(a.taken_at) ?? "";
      const tb = toDateKey(b.taken_at) ?? "";
      if (ta !== tb) return ta.localeCompare(tb);
      return (a.id ?? 0) - (b.id ?? 0);
    });
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const y = extractYear(curr.taken_at);
      const delta = curr.playtime_min - prev.playtime_min;
      if (y === year && delta > 0) {
        snapshotDeltaByGame.set(curr.game_id, (snapshotDeltaByGame.get(curr.game_id) ?? 0) + delta);
        const plat = (curr.platform in PLATFORMS ? curr.platform : "other") as PlatformId;
        snapshotDeltaByPlatform.set(plat, (snapshotDeltaByPlatform.get(plat) ?? 0) + delta);
        let pSet = snapshotGamesByPlatform.get(plat);
        if (!pSet) {
          pSet = new Set<number>();
          snapshotGamesByPlatform.set(plat, pSet);
        }
        pSet.add(curr.game_id);
        const mIdx = extractMonthIndex(curr.taken_at);
        if (mIdx !== null) {
          snapshotDeltaByMonth[mIdx] += delta;
        }
      }
    }
  }

  const totalSnapshotDeltaMin = [...snapshotDeltaByGame.values()].reduce((a, b) => a + b, 0);
  const playtimeMode: "snapshots" | "total" = totalSnapshotDeltaMin > 0 ? "snapshots" : "total";

  // 2. Durchgespielte Spiele des Jahres
  const completedGames: YearCompletedGame[] = [];
  for (const g of games) {
    if (!g.completed && g.status !== "completed") continue;
    const compKey = getGameCompletionDateKey(g);
    const compYear = extractYear(compKey);
    if (compYear === year && compKey) {
      const durationMin = g.playtimeMin > 0 ? g.playtimeMin : (g.ttbNormally ?? 0);
      completedGames.push({
        game: g,
        completedDate: compKey,
        completedDateLabel: formatDateDe(compKey),
        playtimeMin: g.playtimeMin,
        durationMin,
      });
    }
  }
  completedGames.sort(
    (a, b) =>
      b.completedDate.localeCompare(a.completedDate) ||
      b.durationMin - a.durationMin ||
      a.game.title.localeCompare(b.game.title, "de"),
  );

  // 3. Längstes & kürzestes durchgespieltes Spiel des Jahres
  const completedByLength = [...completedGames]
    .filter((c) => c.durationMin > 0)
    .sort((a, b) => b.durationMin - a.durationMin || a.game.title.localeCompare(b.game.title, "de"));
  const longestCompleted = completedByLength[0] ?? completedGames[0] ?? null;
  const shortestCompleted =
    completedByLength.length > 0
      ? completedByLength[completedByLength.length - 1]
      : (completedGames[completedGames.length - 1] ?? null);

  // 4. Im Jahr aktive Spiele bestimmen
  const completedGameIdsInYear = new Set(completedGames.map((c) => c.game.id));
  const activeGamesWithDates = games.filter((g) => {
    if (snapshotDeltaByGame.has(g.id)) return true;
    if (completedGameIdsInYear.has(g.id)) return true;
    if (extractYear(g.lastPlayed) === year) return true;
    return g.ownerships.some((o) => extractYear(o.lastPlayed) === year);
  });

  // Falls im aktuellen Jahr keine Datumsangaben matchen (z. B. Import ohne lastPlayed), auf gespielte Spiele zurückfallen
  const activeGames =
    activeGamesWithDates.length > 0
      ? activeGamesWithDates
      : year === currentYear
        ? games.filter((g) => g.playtimeMin > 0 || g.completed)
        : [];

  const libraryTotalPlaytimeMin = games.reduce((s, g) => s + g.playtimeMin, 0);
  const activeTotalPlaytimeMin = activeGames.reduce((s, g) => s + g.playtimeMin, 0);
  const playtimeMin = playtimeMode === "snapshots" ? totalSnapshotDeltaMin : activeTotalPlaytimeMin;

  // Hilfsfunktion: Maßgebliche Spielzeit eines Spiels für das gewählte Jahr
  const gameYearPlaytime = (g: Game): number =>
    playtimeMode === "snapshots" ? (snapshotDeltaByGame.get(g.id) ?? 0) : g.playtimeMin;

  // 5. Meistgespieltes Spiel des Jahres
  let mostPlayedGame: YearReviewData["mostPlayedGame"] = null;
  const candidatePool = playtimeMode === "snapshots" ? games.filter((g) => (snapshotDeltaByGame.get(g.id) ?? 0) > 0) : activeGames;
  if (candidatePool.length > 0) {
    const sortedByPlay = [...candidatePool].sort(
      (a, b) => gameYearPlaytime(b) - gameYearPlaytime(a) || a.title.localeCompare(b.title, "de"),
    );
    const best = sortedByPlay[0];
    if (best && gameYearPlaytime(best) > 0) {
      mostPlayedGame = {
        game: best,
        playtimeMin: gameYearPlaytime(best),
        isSnapshotDelta: playtimeMode === "snapshots",
      };
    }
  }

  // 6. Lieblingsgenre des Jahres
  const genreMap = new Map<GenreCategory, { playtimeMin: number; gameCount: number; completedCount: number }>();
  for (const g of activeGames) {
    const gPlay = gameYearPlaytime(g);
    const isComp = completedGameIdsInYear.has(g.id);
    for (const cat of gameGenres(g)) {
      const cur = genreMap.get(cat) ?? { playtimeMin: 0, gameCount: 0, completedCount: 0 };
      cur.playtimeMin += gPlay;
      cur.gameCount += 1;
      if (isComp) cur.completedCount += 1;
      genreMap.set(cat, cur);
    }
  }
  const totalGenrePlaytime = [...genreMap.values()].reduce((s, v) => s + v.playtimeMin, 0);
  const genres: YearGenreStat[] = [...genreMap.entries()]
    .map(([genre, v]) => ({
      genre,
      playtimeMin: v.playtimeMin,
      gameCount: v.gameCount,
      completedCount: v.completedCount,
      sharePercent: totalGenrePlaytime > 0 ? Math.round((v.playtimeMin / totalGenrePlaytime) * 100) : 0,
    }))
    .sort(
      (a, b) =>
        b.playtimeMin - a.playtimeMin ||
        b.gameCount - a.gameCount ||
        a.genre.localeCompare(b.genre, "de"),
    );
  const topGenre = genres[0] ?? null;

  // 7. Lieblingsplattform des Jahres
  const platformPlaytime = new Map<PlatformId, number>();
  const platformGames = new Map<PlatformId, Set<number>>();
  if (playtimeMode === "snapshots") {
    for (const [plat, mins] of snapshotDeltaByPlatform.entries()) {
      platformPlaytime.set(plat, mins);
    }
    for (const [plat, set] of snapshotGamesByPlatform.entries()) {
      platformGames.set(plat, set);
    }
  } else {
    for (const g of activeGames) {
      for (const o of g.ownerships) {
        const oYear = extractYear(o.lastPlayed);
        // Wenn Ownership ein lastPlayed in einem anderen Jahr hat, aber das Spiel im Jahr aktiv war,
        // zählen wir Ownerships ohne Widerspruch oder alle Ownerships des aktiven Spiels
        if (oYear !== null && oYear !== year && g.ownerships.some((x) => extractYear(x.lastPlayed) === year)) {
          continue;
        }
        platformPlaytime.set(o.platform, (platformPlaytime.get(o.platform) ?? 0) + o.playtimeMin);
        let set = platformGames.get(o.platform);
        if (!set) {
          set = new Set<number>();
          platformGames.set(o.platform, set);
        }
        set.add(g.id);
      }
    }
  }
  const totalPlatPlaytime = [...platformPlaytime.values()].reduce((a, b) => a + b, 0);
  const platforms: YearPlatformStat[] = PLATFORM_ORDER.filter(
    (p) => (platformGames.get(p)?.size ?? 0) > 0 || (platformPlaytime.get(p) ?? 0) > 0,
  )
    .map((p) => {
      const info = PLATFORMS[p] ?? PLATFORMS.other;
      const mins = platformPlaytime.get(p) ?? 0;
      const count = platformGames.get(p)?.size ?? 0;
      return {
        platform: p,
        label: info.label,
        short: info.short,
        color: info.color,
        playtimeMin: mins,
        gameCount: count,
        sharePercent: totalPlatPlaytime > 0 ? Math.round((mins / totalPlatPlaytime) * 100) : 0,
      };
    })
    .sort((a, b) => b.playtimeMin - a.playtimeMin || b.gameCount - a.gameCount);
  const topPlatform = platforms[0] ?? null;

  // 8. Neu hinzugekommene Spiele im Jahr
  const newGames = games
    .filter((g) => extractYear(g.createdAt) === year)
    .sort((a, b) => b.playtimeMin - a.playtimeMin || a.title.localeCompare(b.title, "de"));
  const newGamesCount = newGames.length;

  // 9. Monatsverlauf (Jan..Dez)
  const byMonth: YearMonthStat[] = MONTH_SHORT_DE.map((label, idx) => ({
    monthIndex: idx,
    label,
    fullLabel: `${MONTH_FULL_DE[idx]} ${year}`,
    activeCount: 0,
    completedCount: 0,
    playtimeMin: playtimeMode === "snapshots" ? snapshotDeltaByMonth[idx] : 0,
  }));

  for (const c of completedGames) {
    const m = extractMonthIndex(c.completedDate);
    if (m !== null) byMonth[m].completedCount += 1;
  }
  for (const g of activeGames) {
    const m =
      extractYear(g.lastPlayed) === year
        ? extractMonthIndex(g.lastPlayed)
        : extractYear(g.completedAt) === year
          ? extractMonthIndex(g.completedAt)
          : null;
    if (m !== null) {
      byMonth[m].activeCount += 1;
      if (playtimeMode === "total") {
        byMonth[m].playtimeMin += g.playtimeMin;
      }
    }
  }

  // 10. Cover-Collage für den Wrapped-Rückblick
  const collageSeen = new Set<number>();
  const collageGames: Game[] = [];
  const pushCollage = (g: Game) => {
    if (collageSeen.has(g.id) || collageGames.length >= 12) return;
    collageSeen.add(g.id);
    collageGames.push(g);
  };
  for (const c of completedGames) pushCollage(c.game);
  for (const g of [...activeGames].sort((a, b) => gameYearPlaytime(b) - gameYearPlaytime(a))) pushCollage(g);
  for (const g of newGames) pushCollage(g);

  return {
    year,
    availableYears,
    playtimeMode,
    playtimeMin,
    libraryTotalPlaytimeMin,
    activeGamesCount: activeGames.length,
    completedGames,
    longestCompleted,
    shortestCompleted,
    mostPlayedGame,
    topGenre,
    genres: genres.slice(0, 8),
    topPlatform,
    platforms,
    newGamesCount,
    newGames: newGames.slice(0, 12),
    byMonth,
    collageGames,
  };
}
