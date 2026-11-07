import type { SessionPreference } from "./types";

export const timeClass = (minutes: number): SessionPreference => minutes <= 45 ? "short" : minutes <= 120 ? "medium" : "long";

/** Sync deltas are estimates: ignore resets, unchanged counters and increments over eight hours. */
export function typicalSession(snapshots: { platform: string; playtime_min: number }[]): number | null {
  const previous = new Map<string, number>();
  const deltas: number[] = [];
  for (const row of snapshots) {
    const before = previous.get(row.platform);
    if (before !== undefined) {
      const delta = row.playtime_min - before;
      if (delta > 0 && delta <= 480) deltas.push(delta);
    }
    previous.set(row.platform, row.playtime_min);
  }
  if (deltas.length < 3) return null;
  deltas.sort((a, b) => a - b);
  const middle = Math.floor(deltas.length / 2);
  return Math.round(deltas.length % 2 ? deltas[middle] : (deltas[middle - 1] + deltas[middle]) / 2);
}

export function significantTags(tags: { name: string; votes: number }[]): string[] {
  const top = Math.max(0, ...tags.map(t => t.votes));
  return tags.filter(t => t.votes > 0 && t.votes >= top * 0.1).map(t => t.name);
}
