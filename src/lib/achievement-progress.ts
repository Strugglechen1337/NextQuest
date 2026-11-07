export interface AchievementProgress { achievementsEarned?: number; achievementsTotal?: number; progressPct?: number }
const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" ? v as Record<string, unknown> : {};
const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
const pct = (v: unknown) => { const n = count(v); return n !== undefined && n <= 100 ? n : undefined; };
function ratio(earned: unknown, total: unknown): AchievementProgress {
  const e = count(earned), t = count(total);
  return e !== undefined && t !== undefined && t > 0 && e <= t ? { achievementsEarned: e, achievementsTotal: t, progressPct: e / t * 100 } : {};
}
export function xboxProgress(value: unknown): AchievementProgress {
  const v = obj(value), a = obj(v.achievement);
  const counts = ratio(a.currentAchievements, a.totalAchievements);
  const score = ratio(a.currentGamerscore, a.totalGamerscore);
  return { ...counts, progressPct: pct(a.progressPercentage) ?? pct(v.progressPercentage) ?? counts.progressPct ?? score.progressPct };
}
export function psnProgress(value: unknown): AchievementProgress {
  const v = obj(value);
  const sum = (x: unknown) => { const a = obj(x); const values = [a.bronze, a.silver, a.gold, a.platinum]; return values.every(n => count(n) !== undefined) ? values.reduce<number>((s,n) => s + (n as number), 0) : undefined; };
  const counts = ratio(sum(v.earnedTrophies), sum(v.definedTrophies));
  return { ...counts, progressPct: pct(v.progress) ?? counts.progressPct };
}
export function steamProgress(value: unknown): AchievementProgress {
  const stats = obj(obj(value).playerstats);
  if (stats.success !== true || !Array.isArray(stats.achievements) || !stats.achievements.length) return {};
  if (!stats.achievements.every(a => obj(a).achieved === 0 || obj(a).achieved === 1)) return {};
  return ratio(stats.achievements.filter(a => obj(a).achieved === 1).length, stats.achievements.length);
}
