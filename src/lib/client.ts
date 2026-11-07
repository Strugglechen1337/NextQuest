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

/** Ruft IGDB stapelweise auf, bis alle Spiele angereichert sind. */
export async function runEnrich(onProgress: (done: number, remaining: number) => void, retry = false) {
  let done = 0;
  let first = true;
  for (;;) {
    const r = await api<{ processed: number; remaining: number }>(
      `/api/sync/${retry && first ? "igdb-retry" : "igdb"}`,
      { body: {} },
    );
    first = false;
    done += r.processed;
    onProgress(done, r.remaining);
    if (r.remaining === 0 || r.processed === 0) return done;
  }
}
