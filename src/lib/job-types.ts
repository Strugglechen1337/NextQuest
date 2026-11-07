export const JOB_KINDS = ["enrich", "enrich-refresh", "enrich-retry", "descriptions", "sync-all"] as const;
export type JobKind = typeof JOB_KINDS[number];
export interface Job {
  id: string;
  kind: JobKind;
  startedAt: string;
  endedAt?: string;
  step: string;
  done: number;
  remaining: number;
  errors: Record<string, string>;
  platforms: Record<string, { ok: boolean; result?: unknown; error?: string }>;
  note?: string;
}
export interface JobsStatus {
  running: Job | null;
  last: Job | null;
  auto: { enabled: boolean; time: string; lastRun: string | null };
  nextRun: string | null;
}
