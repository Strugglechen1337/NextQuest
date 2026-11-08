import { gameGenres, type GenreCategory } from "./genres";
import { formatDateDe, toDateKey } from "./goals";
import { PLATFORM_ORDER, PLATFORMS, type PlatformId } from "./platforms";
import type { Game } from "./types";
import { estimateYearPlaytime, type YearEstimateSource } from "./year-estimate";

export interface PlaytimeSnapshotRow {
  id?: number;
  game_id: number;
  platform: string;
  taken_at: string;
  playtime_min: number;
}

export interface AchievementUnlockRow { game_id: number; platform: string; external_id: string; unlocked_at: string }

export interface YearCompletedGame {
  game: Game;
  completedDate: string;
  completedDateLabel: string;
  completionDateUnknown: boolean;
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
  source: YearEstimateSource;
}

export interface YearPlatformStat {
  platform: PlatformId;
  label: string;
  short: string;
  color: string;
  playtimeMin: number;
  gameCount: number;
  sharePercent: number;
  source: YearEstimateSource;
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
  playtimeSource: YearEstimateSource;
  firstSnapshot: string | null;
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
    source: YearEstimateSource;
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
  unlocks: readonly AchievementUnlockRow[] = [],
): YearReviewData {
  const currentYear = now.getUTCFullYear();
  const yearsSet = new Set<number>([currentYear]);

  for (const g of games) {
    const yc = extractYear(g.completedOn ?? g.completedAt);
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
  for (const u of unlocks) { const y = extractYear(u.unlocked_at); if (y) yearsSet.add(y); }
  if (requestedYear && Number.isInteger(requestedYear) && requestedYear >= 1970 && requestedYear <= 2100) {
    yearsSet.add(requestedYear);
  }

  const availableYears = [...yearsSet].sort((a, b) => b - a);
  const year =
    requestedYear && yearsSet.has(requestedYear) ? requestedYear : (availableYears[0] ?? currentYear);

  // Jede Plattform erhält ihren eigenen Snapshot-Verlauf und ihre eigenen Erfolge.
  const yearByGame = new Map<number, number>();
  const sourceByGame = new Map<number, YearEstimateSource>();
  const platformPlaytime = new Map<PlatformId, number>();
  const platformGames = new Map<PlatformId, Set<number>>();
  const sourceByPlatform = new Map<PlatformId, YearEstimateSource>();
  const monthMinutes = new Array<number>(12).fill(0);
  const snapshotGroups = new Map<string, PlaytimeSnapshotRow[]>();
  const unlockGroups = new Map<string, AchievementUnlockRow[]>();
  const unlockedGamesThisYear = new Set<number>();
  for (const row of snapshots) {
    const key = `${row.game_id}:${row.platform}`, group = snapshotGroups.get(key) ?? [];
    group.push(row); snapshotGroups.set(key, group);
  }
  for (const row of unlocks) {
    const key = `${row.game_id}:${row.platform}`, group = unlockGroups.get(key) ?? [];
    group.push(row); unlockGroups.set(key, group);
    if (extractYear(row.unlocked_at) === year) unlockedGamesThisYear.add(row.game_id);
  }
  let measured = false, estimated = false;
  const combine = (a: YearEstimateSource | undefined, b: YearEstimateSource): YearEstimateSource =>
    a === "geschätzt (Erfolge)" || b === "geschätzt (Erfolge)" ? "geschätzt (Erfolge)" : a === "gemessen" || b === "gemessen" ? "gemessen" : "unbekannt";
  for (const game of games) {
    const platforms = new Set(game.ownerships.map(o => o.platform));
    for (const platform of platforms) {
      const total = game.ownerships.filter(o => o.platform === platform).reduce((sum, o) => sum + o.playtimeMin, 0);
      const key = `${game.id}:${platform}`;
      const rows = snapshotGroups.get(key) ?? [];
      const events = unlockGroups.get(key) ?? [];
      const result = estimateYearPlaytime(year, total, rows, events);
      measured ||= result.measuredMinutes > 0 || result.source === "gemessen";
      estimated ||= result.source === "geschätzt (Erfolge)";
      sourceByGame.set(game.id, combine(sourceByGame.get(game.id), result.source));
      if (result.minutes > 0) {
        yearByGame.set(game.id, (yearByGame.get(game.id) ?? 0) + result.minutes);
        platformPlaytime.set(platform, (platformPlaytime.get(platform) ?? 0) + result.minutes);
        sourceByPlatform.set(platform, combine(sourceByPlatform.get(platform), result.source));
        const set = platformGames.get(platform) ?? new Set<number>(); set.add(game.id); platformGames.set(platform, set);
      }
      // Monatswerte zeigen nur gemessene Intervalle, keine fiktive Verteilung der Schätzung.
      const sorted = [...rows].sort((a,b) => a.taken_at.localeCompare(b.taken_at) || (a.id ?? 0) - (b.id ?? 0));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], curr = sorted[i], m = extractMonthIndex(curr.taken_at);
        if (extractYear(prev.taken_at) === year && extractYear(curr.taken_at) === year && m !== null && curr.playtime_min >= prev.playtime_min) monthMinutes[m] += curr.playtime_min - prev.playtime_min;
      }
    }
  }
  const playtimeSource: YearEstimateSource = estimated ? "geschätzt (Erfolge)" : measured ? "gemessen" : "unbekannt";
  const playtimeMode: "snapshots" | "total" = "snapshots";
  const firstSnapshot = snapshots.filter(s => Number.isFinite(Date.parse(s.taken_at))).sort((a,b) => a.taken_at.localeCompare(b.taken_at))[0]?.taken_at ?? null;
  const playtimeMin = [...yearByGame.values()].reduce((a,b) => a + b, 0);

  // 2. Durchgespielte Spiele des Jahres
  const completedGames: YearCompletedGame[] = [];
  for (const g of games) {
    if (!g.completed && g.status !== "completed") continue;
    const compKey = toDateKey(g.completedOn) ?? toDateKey(g.completedAt);
    const compYear = extractYear(compKey);
    if (compYear === year && compKey) {
      const durationMin = g.playtimeMin > 0 ? g.playtimeMin : (g.ttbNormally ?? 0);
      completedGames.push({
        game: g,
        completedDate: compKey,
        completedDateLabel: formatDateDe(compKey),
        completionDateUnknown: !g.completedOn,
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

  // Daten ohne Jahresbezug liefern keine erfundene Spielzeit.
  const completedGameIdsInYear = new Set(completedGames.map(c => c.game.id));
  const activeGames = games.filter(g => yearByGame.has(g.id) || completedGameIdsInYear.has(g.id) || extractYear(g.lastPlayed) === year || g.ownerships.some(o => extractYear(o.lastPlayed) === year) || unlockedGamesThisYear.has(g.id));
  const libraryTotalPlaytimeMin = games.reduce((sum, g) => sum + g.playtimeMin, 0);
  const gameYearPlaytime = (g: Game): number => yearByGame.get(g.id) ?? 0;

  // 5. Meistgespieltes Spiel des Jahres
  let mostPlayedGame: YearReviewData["mostPlayedGame"] = null;
  const candidatePool = games.filter(g => gameYearPlaytime(g) > 0);
  if (candidatePool.length > 0) {
    const sortedByPlay = [...candidatePool].sort(
      (a, b) => gameYearPlaytime(b) - gameYearPlaytime(a) || a.title.localeCompare(b.title, "de"),
    );
    const best = sortedByPlay[0];
    if (best && gameYearPlaytime(best) > 0) {
      mostPlayedGame = {
        game: best,
        playtimeMin: gameYearPlaytime(best),
        isSnapshotDelta: sourceByGame.get(best.id) === "gemessen",
        source: sourceByGame.get(best.id) ?? "unbekannt",
      };
    }
  }

  // 6. Lieblingsgenre des Jahres
  const genreMap = new Map<GenreCategory, { playtimeMin: number; gameCount: number; completedCount: number; source: YearEstimateSource }>();
  for (const g of activeGames) {
    const gPlay = gameYearPlaytime(g);
    if (!gPlay) continue;
    const isComp = completedGameIdsInYear.has(g.id);
    for (const cat of gameGenres(g)) {
      const cur = genreMap.get(cat) ?? { playtimeMin: 0, gameCount: 0, completedCount: 0, source: "unbekannt" as YearEstimateSource };
      cur.playtimeMin += gPlay;
      cur.source = combine(cur.source, sourceByGame.get(g.id) ?? "unbekannt");
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
      source: v.source,
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
        source: sourceByPlatform.get(p) ?? "unbekannt",
        sharePercent: totalPlatPlaytime > 0 ? Math.round((mins / totalPlatPlaytime) * 100) : 0,
      };
    })
    .sort((a, b) => b.playtimeMin - a.playtimeMin || b.gameCount - a.gameCount);
  const topPlatform = platforms[0] ?? null;

  // 8. Neu hinzugekommene Spiele im Jahr
  const newGames = games
    .filter((g) => g.ownerships.length > 0 && g.ownerships.every(o => !!o.firstSeen) && extractYear(g.ownerships.map(o => o.firstSeen!).sort()[0]) === year)
    .sort((a, b) => b.playtimeMin - a.playtimeMin || a.title.localeCompare(b.title, "de"));
  const newGamesCount = newGames.length;

  // 9. Monatsverlauf (Jan..Dez)
  const byMonth: YearMonthStat[] = MONTH_SHORT_DE.map((label, idx) => ({
    monthIndex: idx,
    label,
    fullLabel: `${MONTH_FULL_DE[idx]} ${year}`,
    activeCount: 0,
    completedCount: 0,
    playtimeMin: monthMinutes[idx],
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
    playtimeSource,
    firstSnapshot,
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
