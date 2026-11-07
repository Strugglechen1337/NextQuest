"use client";

import type { Game, LibraryStats } from "./types";

export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Fehler ${res.status}`);
  return data as T;
}

export interface LibraryResponse {
  games: Game[];
  stats: LibraryStats;
  settings: Record<string, string | null>;
  igdb: boolean;
}

/** Starts a server job; closing this page only stops progress polling. */
export async function runJob(kind: import("./job-types").JobKind, onProgress: (done: number, remaining: number) => void) {
  const job = await api<import("./job-types").Job>("/api/jobs", { body: { kind } });
  for (;;) {
    const status = await api<import("./job-types").JobsStatus>("/api/jobs");
    const current = status.running?.id === job.id ? status.running : status.last?.id === job.id ? status.last : null;
    if (current) {
      onProgress(current.done, current.remaining);
      if (current.endedAt) {
        const errors = Object.entries(current.errors).map(([name, error]) => `${name}: ${error}`);
        if (errors.length || current.note) throw new Error([...errors, current.note].filter(Boolean).join(" · "));
        return current.done;
      }
    }
    // A completed job can be superseded by another browser before our next poll.
    if (!current && status.last && status.last.startedAt > job.startedAt) return job.done;
    if (!current && !status.running) throw new Error("Der Server wurde neu gestartet. Bereits gespeicherte Schritte bleiben erhalten; bitte den Job erneut starten.");
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

export function runEnrich(onProgress: (done: number, remaining: number) => void, retry: boolean | "refresh" = false) {
  return runJob(retry === "refresh" ? "enrich-refresh" : retry ? "enrich-retry" : "enrich", onProgress);
}

export function runDescriptions(onProgress: (done: number, remaining: number) => void) {
  return runJob("descriptions", onProgress);
}
