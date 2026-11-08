"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Game } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";

type Result = { query: string; exact: Game[]; similar: Game[]; error?: string; unresolved?: boolean };
export function Check({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [browserQuery, setBrowserQuery] = useState(initialQuery);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- URL query is only available after hydration
  useEffect(() => { if (process.env.NEXT_PUBLIC_DEMO === "1") { const q = new URLSearchParams(window.location.search).get("q") ?? ""; setBrowserQuery(q); setQuery(q); } }, []);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!browserQuery.trim()) return;
    let active = true;
    api<Result>(`/api/check?q=${encodeURIComponent(browserQuery)}`).then(r => { if (active) setResult(r); }).catch(() => { if (active) setResult({ query: browserQuery, exact: [], similar: [], error: "Prüfung fehlgeschlagen. Bitte erneut versuchen." }); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [browserQuery]);
  const owned = result?.exact.flatMap(g => g.ownerships).filter(o => o.platform !== "gamepass") ?? [];
  const inPass = result?.exact.some(g => g.inGamePass);
  return <section className="mx-auto w-full min-w-0 max-w-3xl space-y-6 pb-12 [overflow-wrap:anywhere]">
    <div><p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">Vor dem Kauf</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Hab ich das schon?</h1><p className="mt-3 text-white/65">Prüfe deine Bibliothek und den synchronisierten Game Pass mit einem Spielnamen oder Store-Link.</p></div>
    <form action={process.env.NEXT_PUBLIC_DEMO === "1" ? "/NextQuest/check/" : "/check"} className="flex flex-col gap-3 sm:flex-row" onSubmit={() => setLoading(true)}>
      <label className="sr-only" htmlFor="check-query">Spielname oder Store-Link</label><input id="check-query" name="q" required maxLength={1000} value={query} onChange={e => setQuery(e.target.value)} placeholder="Spielname oder Store-Link einfügen" className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/20 bg-white/5 px-4 text-white outline-none focus:border-violet-400" />
      <button className="min-h-12 rounded-xl bg-violet-500 px-6 font-bold text-white hover:bg-violet-400">Prüfen</button>
    </form>
    <div aria-live="polite">{loading ? <p>Wird geprüft …</p> : result && <div className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-7">
      {result.error ? <p>{result.error}</p> : <><p className="text-sm text-white/60">Ergebnis für {result.query}</p><h2 className="mt-2 text-2xl font-bold">{owned.length ? "✅ Hast du schon" : inPass ? "🎮 Im Game Pass enthalten" : "❌ Nicht in deiner Sammlung"}</h2>
      {result.unresolved && !result.exact.length && <p className="mt-3 text-white/70">Der Store ist nicht erreichbar oder liefert keinen Titel. Bitte suche mit dem Spielnamen erneut.</p>}
      {owned.length > 0 && <p className="mt-3 text-lg">Auf {[...new Set(owned.map(o => `${PLATFORMS[o.platform].label}${o.playtimeMin ? ` (${Math.round(o.playtimeMin / 60 * 10) / 10} Std)` : ""}`))].join(" und ")}{inPass ? " · Auch im Game Pass" : ""}</p>}
      {result.similar.length > 0 && <div className="mt-6"><h3 className="font-semibold">Meintest du …?</h3><ul className="mt-2 space-y-2 text-white/75">{result.similar.map(g => <li key={g.id}>{g.title} – {g.ownerships.map(o => PLATFORMS[o.platform].label).join(", ")}</li>)}</ul></div>}</>}
    </div>}</div>
  </section>;
}
