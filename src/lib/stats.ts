import { gameGenres, type GenreCategory } from "./genres";
import { PLATFORM_ORDER, PLATFORMS, type PlatformId } from "./platforms";
import { hasMultiplayer } from "./session";
import type { Game } from "./types";

/**
 * Filtert und sortiert die Spiele für die „Weiterspielen“-Reihe:
 * nicht durchgespielte Spiele mit `lastPlayed`, absteigend nach Datum, max. `limit` (Standard 12).
 */
export function getContinueGames(games: readonly Game[], limit = 12): Game[] {
  return games
    .filter((g) => !g.completed && !!g.lastPlayed && !Number.isNaN(Date.parse(g.lastPlayed)))
    .sort((a, b) => {
      const ta = Date.parse(a.lastPlayed!);
      const tb = Date.parse(b.lastPlayed!);
      if (tb !== ta) return tb - ta;
      return b.playtimeMin - a.playtimeMin || a.title.localeCompare(b.title, "de");
    })
    .slice(0, limit);
}

/**
 * Formatiert `lastPlayed` als „zuletzt vor X Tagen“ (bzw. „zuletzt heute“ / „zuletzt vor 1 Tag“).
 */
export function formatLastPlayedDays(lastPlayed: string | null, nowMs = Date.now()): string {
  if (!lastPlayed) return "";
  const parsed = Date.parse(lastPlayed);
  if (Number.isNaN(parsed)) return "";
  const days = Math.max(0, Math.floor((nowMs - parsed) / 86_400_000));
  if (days === 0) return "zuletzt heute";
  if (days === 1) return "zuletzt vor 1 Tag";
  return `zuletzt vor ${days} Tagen`;
}

/**
 * Berechnet den geschätzten Story-Fortschritt in Prozent (Spielzeit / ttbNormally),
 * gedeckelt bei 99 %. Gibt `null` zurück, wenn keine Spieldauer bekannt ist oder es sich
 * um ein Mehrspieler-Spiel handelt, dessen Spielzeit die Hauptstory-Dauer übersteigt.
 */
export function getStoryProgressPercent(game: Game): number | null {
  const total = game.ttbNormally;
  if (total === null || total === undefined || total <= 0) return null;
  if (hasMultiplayer(game) && game.playtimeMin > total) return null;
  if (game.playtimeMin <= 0) return 0;
  const raw = Math.round((game.playtimeMin / total) * 100);
  return Math.min(99, Math.max(1, raw));
}

export interface PlatformStat {
  platform: PlatformId;
  label: string;
  short: string;
  color: string;
  playtimeMin: number;
  gameCount: number;
  sharePercent: number;
}

export interface GenreStat {
  genre: GenreCategory;
  gameCount: number;
  playtimeMin: number;
  completedCount: number;
}

export type DurationBucketId = "under5" | "5to15" | "15to40" | "over40";

export interface DurationBucketStat {
  id: DurationBucketId;
  label: string;
  count: number;
  completedCount: number;
  sharePercent: number;
}

export interface MonthActivityStat {
  key: string;
  label: string;
  fullLabel: string;
  count: number;
}

export interface LibraryStatistics {
  kpis: {
    total: number;
    owned: number;
    gamePassOnly: number;
    completed: number;
    completionRatePercent: number;
    totalPlaytimeMin: number;
    pileOfShameCount: number;
    unplayedTotalCount: number;
    openCount: number;
    remainingTtbMin: number;
    openWithKnownDurationCount: number;
    duplicatesCount: number;
    extraCopiesCount: number;
  };
  byPlatform: PlatformStat[];
  byGenre: GenreStat[];
  byGenreCount: GenreStat[];
  topPlayed: Game[];
  byDuration: DurationBucketStat[];
  unknownDurationCount: number;
  byMonth: MonthActivityStat[];
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

function toYearMonthKey(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
}

export function computeLibraryStatistics(games: readonly Game[], now: Date = new Date()): LibraryStatistics {
  const total = games.length;
  const owned = games.filter((g) => g.owned).length;
  const gamePassOnly = games.filter((g) => !g.owned && g.inGamePass).length;
  const completed = games.filter((g) => g.completed).length;
  const completionRatePercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalPlaytimeMin = games.reduce((sum, g) => sum + g.playtimeMin, 0);

  const openGames = games.filter((g) => !g.completed);
  const pileOfShameCount = openGames.filter((g) => g.playtimeMin === 0).length;
  const unplayedTotalCount = games.filter((g) => g.playtimeMin === 0).length;
  const openWithKnownDuration = openGames.filter((g) => g.ttbNormally !== null && g.ttbNormally > 0);
  const remainingTtbMin = openWithKnownDuration.reduce((sum, g) => sum + (g.ttbNormally ?? 0), 0);

  const duplicatesCount = games.filter((g) => g.copies > 1).length;
  const extraCopiesCount = games.reduce((sum, g) => sum + Math.max(0, g.copies - 1), 0);

  // 1. Spielzeit pro Plattform
  const platformPlaytime = new Map<PlatformId, number>();
  const platformGames = new Map<PlatformId, Set<number>>();
  for (const g of games) {
    for (const o of g.ownerships) {
      platformPlaytime.set(o.platform, (platformPlaytime.get(o.platform) ?? 0) + o.playtimeMin);
      let set = platformGames.get(o.platform);
      if (!set) {
        set = new Set<number>();
        platformGames.set(o.platform, set);
      }
      set.add(g.id);
    }
  }
  const totalPlatformPlaytime = [...platformPlaytime.values()].reduce((a, b) => a + b, 0);
  const byPlatform: PlatformStat[] = PLATFORM_ORDER.filter(
    (p) => (platformGames.get(p)?.size ?? 0) > 0 || (platformPlaytime.get(p) ?? 0) > 0,
  )
    .map((p) => {
      const info = PLATFORMS[p] ?? PLATFORMS.other;
      const playtimeMin = platformPlaytime.get(p) ?? 0;
      const gameCount = platformGames.get(p)?.size ?? 0;
      const sharePercent = totalPlatformPlaytime > 0 ? Math.round((playtimeMin / totalPlatformPlaytime) * 100) : 0;
      return {
        platform: p,
        label: info.label,
        short: info.short,
        color: info.color,
        playtimeMin,
        gameCount,
        sharePercent,
      };
    })
    .sort((a, b) => b.playtimeMin - a.playtimeMin || b.gameCount - a.gameCount);

  // 2. Spiele / Spielzeit pro Genre (Top 10, deutsche Kategorien aus src/lib/genres.ts)
  const genreMap = new Map<GenreCategory, { gameCount: number; playtimeMin: number; completedCount: number }>();
  for (const g of games) {
    for (const cat of gameGenres(g)) {
      const cur = genreMap.get(cat) ?? { gameCount: 0, playtimeMin: 0, completedCount: 0 };
      cur.gameCount += 1;
      cur.playtimeMin += g.playtimeMin;
      if (g.completed) cur.completedCount += 1;
      genreMap.set(cat, cur);
    }
  }
  const allGenreStats: GenreStat[] = [...genreMap.entries()].map(([genre, v]) => ({
    genre,
    gameCount: v.gameCount,
    playtimeMin: v.playtimeMin,
    completedCount: v.completedCount,
  }));
  const byGenre: GenreStat[] = [...allGenreStats]
    .sort(
      (a, b) =>
        b.playtimeMin - a.playtimeMin ||
        b.gameCount - a.gameCount ||
        a.genre.localeCompare(b.genre, "de"),
    )
    .slice(0, 10);
  const byGenreCount: GenreStat[] = [...allGenreStats]
    .sort(
      (a, b) =>
        b.gameCount - a.gameCount ||
        b.playtimeMin - a.playtimeMin ||
        a.genre.localeCompare(b.genre, "de"),
    )
    .slice(0, 10);

  // 3. Top 10 meistgespielte Spiele
  const topPlayed = [...games]
    .filter((g) => g.playtimeMin > 0)
    .sort((a, b) => b.playtimeMin - a.playtimeMin || a.title.localeCompare(b.title, "de"))
    .slice(0, 10);

  // 4. Verteilung der Spieldauer (unter 5 / 5–15 / 15–40 / über 40 Std)
  const rawBuckets: { id: DurationBucketId; label: string; test: (m: number) => boolean }[] = [
    { id: "under5", label: "unter 5 Std", test: (m) => m < 300 },
    { id: "5to15", label: "5–15 Std", test: (m) => m >= 300 && m < 900 },
    { id: "15to40", label: "15–40 Std", test: (m) => m >= 900 && m < 2400 },
    { id: "over40", label: "über 40 Std", test: (m) => m >= 2400 },
  ];
  const knownDurationGames = games.filter((g) => g.ttbNormally !== null && g.ttbNormally > 0);
  const unknownDurationCount = games.length - knownDurationGames.length;
  const byDuration: DurationBucketStat[] = rawBuckets.map((b) => {
    const matching = knownDurationGames.filter((g) => b.test(g.ttbNormally!));
    const count = matching.length;
    const completedCount = matching.filter((g) => g.completed).length;
    const sharePercent = knownDurationGames.length > 0 ? Math.round((count / knownDurationGames.length) * 100) : 0;
    return {
      id: b.id,
      label: b.label,
      count,
      completedCount,
      sharePercent,
    };
  });

  // 5. Zuletzt aktiv (Spiele pro Monat nach lastPlayed, letzte 12 Monate)
  const months: MonthActivityStat[] = [];
  const monthIndexByKey = new Map<string, number>();
  const baseYear = now.getUTCFullYear();
  const baseMonth = now.getUTCMonth();
  for (let offset = 11; offset >= 0; offset--) {
    const d = new Date(Date.UTC(baseYear, baseMonth - offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const key = toYearMonthKey(y, m);
    monthIndexByKey.set(key, months.length);
    months.push({
      key,
      label: MONTH_SHORT_DE[m],
      fullLabel: `${MONTH_FULL_DE[m]} ${y}`,
      count: 0,
    });
  }

  for (const g of games) {
    if (!g.lastPlayed) continue;
    const parsed = Date.parse(g.lastPlayed);
    if (Number.isNaN(parsed)) continue;
    const d = new Date(parsed);
    const key = toYearMonthKey(d.getUTCFullYear(), d.getUTCMonth());
    const idx = monthIndexByKey.get(key);
    if (idx !== undefined) {
      months[idx].count += 1;
    }
  }

  return {
    kpis: {
      total,
      owned,
      gamePassOnly,
      completed,
      completionRatePercent,
      totalPlaytimeMin,
      pileOfShameCount,
      unplayedTotalCount,
      openCount: openGames.length,
      remainingTtbMin,
      openWithKnownDurationCount: openWithKnownDuration.length,
      duplicatesCount,
      extraCopiesCount,
    },
    byPlatform,
    byGenre,
    byGenreCount,
    topPlayed,
    byDuration,
    unknownDurationCount,
    byMonth: months,
  };
}
