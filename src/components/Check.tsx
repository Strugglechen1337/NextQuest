"use client";
import { useEffect, useState } from "react";
import type { Game } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";

type Result = { query: string; exact: Game[]; similar: Game[]; error?: string; unresolved?: boolean };
export function Check({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!initialQuery.trim()) return;
    const controller = new AbortController();
    fetch(`/api/check?q=${encodeURIComponent(initialQuery)}`, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error("Pr?fung fehlgeschlagen"); return r.json(); }).then(setResult).catch(e => { if (e.name !== "AbortError") setResult({ query: initialQuery, exact: [], similar: [], error: "Prüfung fehlgeschlagen. Bitte erneut versuchen." }); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [initialQuery]);
  const owned = result?.exact.flatMap(g => g.ownerships).filter(o => o.platform !== "gamepass") ?? [];
  const inPass = result?.exact.some(g => g.inGamePass);
  return <section className="mx-auto max-w-3xl space-y-6 pb-12">
    <div><p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">Vor dem Kauf</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Hab ich das schon?</h1><p className="mt-3 text-white/65">Prüfe deine Bibliothek und den synchronisierten Game Pass mit einem Spielnamen oder Store-Link.</p></div>
    <form action="/check" className="flex flex-col gap-3 sm:flex-row" onSubmit={() => setLoading(true)}>
      <label className="sr-only" htmlFor="check-query">Spielname oder Store-Link</label><input id="check-query" name="q" required maxLength={1000} value={query} onChange={e => setQuery(e.target.value)} placeholder="Spielname oder Store-Link einfügen" className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/20 bg-white/5 px-4 text-white outline-none focus:border-violet-400" />
      <button className="min-h-12 rounded-xl bg-violet-500 px-6 font-bold text-white hover:bg-violet-400">Prüfen</button>
    </form>
    <div aria-live="polite">{loading ? <p>Wird geprüft …</p> : result && <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-7">
      {result.error ? <p>{result.error}</p> : <><p className="text-sm text-white/60">Ergebnis für {result.query}</p><h2 className="mt-2 text-2xl font-bold">{owned.length ? "✅ Hast du schon" : inPass ? "🎮 Im Game Pass enthalten" : "❌ Nicht in deiner Sammlung"}</h2>
      {result.unresolved && !result.exact.length && <p className="mt-3 text-white/70">Der Store ist nicht erreichbar oder liefert keinen Titel. Bitte suche mit dem Spielnamen erneut.</p>}
      {owned.length > 0 && <p className="mt-3 text-lg">Auf {[...new Set(owned.map(o => `${PLATFORMS[o.platform].label}${o.playtimeMin ? ` (${Math.round(o.playtimeMin / 60 * 10) / 10} Std)` : ""}`))].join(" und ")}{inPass ? " · Auch im Game Pass" : ""}</p>}
      {result.similar.length > 0 && <div className="mt-6"><h3 className="font-semibold">Meintest du …?</h3><ul className="mt-2 space-y-2 text-white/75">{result.similar.map(g => <li key={g.id}>{g.title} – {g.ownerships.map(o => PLATFORMS[o.platform].label).join(", ")}</li>)}</ul></div>}</>}
    </div>}</div>
  </section>;
}
