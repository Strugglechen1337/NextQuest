/** Dated events and cumulative counters for one game on one platform. */
export interface YearEstimateSnapshot {
  taken_at: string;
  playtime_min: number;
  id?: number;
}

export interface YearEstimateUnlock {
  unlocked_at: string;
  external_id: string;
}

export type YearEstimateSource = "gemessen" | "geschätzt (Erfolge)" | "unbekannt";

export interface YearEstimate {
  minutes: number;
  measuredMinutes: number;
  estimatedMinutes: number;
  source: YearEstimateSource;
  firstSnapshot: string | null;
}

/**
 * Distribute only the counter before the first snapshot by historical unlocks.
 * Subsequent differences are attributed only when both observations are in the
 * same calendar year; an interval spanning New Year cannot be allocated exactly.
 */
export function estimateYearPlaytime(
  year: number,
  totalMinutes: number,
  snapshots: readonly YearEstimateSnapshot[],
  unlocks: readonly YearEstimateUnlock[],
  played?: { first: string | null; last: string | null },
): YearEstimate {
  const validTime = (value: string) => {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  };
  const ordered = snapshots.flatMap(s => {
    const time = validTime(s.taken_at);
    return time !== null && Number.isFinite(s.playtime_min) && s.playtime_min >= 0 ? [{ ...s, time }] : [];
  }).sort((a, b) => a.time - b.time || (a.id ?? 0) - (b.id ?? 0));
  const first = ordered[0];
  let measuredMinutes = 0;
  let observed = false;
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1], next = ordered[i];
    if (new Date(prev.time).getUTCFullYear() !== year || new Date(next.time).getUTCFullYear() !== year) continue;
    if (next.playtime_min < prev.playtime_min) continue;
    observed = true;
    measuredMinutes += next.playtime_min - prev.playtime_min;
  }

  const historical = new Map<string, number>();
  for (const unlock of unlocks) {
    const time = validTime(unlock.unlocked_at);
    if (time === null || (first && time >= first.time) || !unlock.external_id) continue;
    const firstYear = played?.first ? new Date(played.first).getUTCFullYear() : NaN;
    const lastYear = played?.last ? new Date(played.last).getUTCFullYear() : NaN;
    const unlockYear = new Date(time).getUTCFullYear();
    if (Number.isFinite(firstYear) && unlockYear < firstYear || Number.isFinite(lastYear) && unlockYear > lastYear) continue;
    if (!historical.has(unlock.external_id)) historical.set(unlock.external_id, time);
  }
  const dates = [...historical.values()];
  const yearCount = dates.filter(t => new Date(t).getUTCFullYear() === year).length;
  const baseline = first ? first.playtime_min : Math.max(0, Number.isFinite(totalMinutes) ? totalMinutes : 0);
  const estimatedMinutes = dates.length ? Math.round(baseline * yearCount / dates.length) : 0;
  const estimated = yearCount > 0 && baseline > 0;
  return {
    minutes: measuredMinutes + estimatedMinutes,
    measuredMinutes,
    estimatedMinutes,
    source: estimated ? "geschätzt (Erfolge)" : observed ? "gemessen" : "unbekannt",
    firstSnapshot: first?.taken_at ?? null,
  };
}
