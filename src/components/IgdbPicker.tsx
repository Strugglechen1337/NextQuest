"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { GameMeta } from "@/lib/library";
import { formatMinutes } from "@/lib/suggest";
import { Cover } from "./ui";

/** Sucht in IGDB und lässt einen Treffer auswählen. */
export function IgdbPicker({
  initial,
  onPick,
  selectedId,
}: {
  initial: string;
  onPick: (m: GameMeta) => void;
  selectedId?: number | null;
}) {
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<GameMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await api<{ results: GameMeta[] }>(`/api/igdb/search?q=${encodeURIComponent(q)}`);
        setResults(r.results);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-2">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Spiel suchen…" />
      {loading && <div className="text-xs text-white/50">Suche…</div>}
      {error && <div className="text-xs text-red-300">{error}</div>}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {results.map((m) => (
          <button
            key={m.igdbId}
            type="button"
            onClick={() => onPick(m)}
            className={`flex w-full items-center gap-3 rounded-lg border p-1.5 text-left text-sm transition ${
              selectedId === m.igdbId
                ? "border-violet-400/70 bg-violet-500/15"
                : "border-transparent hover:border-white/10 hover:bg-white/5"
            }`}
          >
            <Cover src={m.coverUrl} title={m.title} className="h-12 w-9 shrink-0 rounded text-xs" />
            <div className="min-w-0">
              <div className="truncate font-medium">{m.title}</div>
              <div className="text-xs text-white/50">
                {m.releaseYear ?? "?"} · ⏱ {formatMinutes(m.ttbNormally)}
                {m.rating ? ` · ★ ${Math.round(m.rating)}` : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
