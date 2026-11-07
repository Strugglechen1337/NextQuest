"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type LibraryResponse } from "@/lib/client";
import { PLATFORM_ORDER, PLATFORMS, type PlatformId } from "@/lib/platforms";
import { formatMinutes } from "@/lib/suggest";
import type { Game } from "@/lib/types";
import { AddGameDialog } from "./AddGameDialog";
import { GameCard } from "./GameCard";
import { GameDetail } from "./GameDetail";
import { SuggestPanel } from "./SuggestPanel";
import { Notice } from "./ui";

type Status = "open" | "all" | "completed";
type Ownership = "owned" | "all" | "gamepass";
type Sort = "playtime" | "popularity" | "rating" | "duration-asc" | "duration-desc" | "recent" | "title";
type Duration = "any" | "short" | "medium" | "long" | "huge" | "unknown";

const DURATIONS: { id: Duration; label: string; test: (m: number | null) => boolean }[] = [
  { id: "any", label: "Jede Dauer", test: () => true },
  { id: "short", label: "unter 5 Std", test: (m) => m !== null && m < 300 },
  { id: "medium", label: "5–15 Std", test: (m) => m !== null && m >= 300 && m < 900 },
  { id: "long", label: "15–40 Std", test: (m) => m !== null && m >= 900 && m < 2400 },
  { id: "huge", label: "über 40 Std", test: (m) => m !== null && m >= 2400 },
  { id: "unknown", label: "Dauer unbekannt", test: (m) => m === null },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "playtime", label: "Meiste Spielzeit" },
  { id: "popularity", label: "Beliebtheit" },
  { id: "rating", label: "Bewertung" },
  { id: "duration-asc", label: "Kürzeste zuerst" },
  { id: "duration-desc", label: "Längste zuerst" },
  { id: "recent", label: "Zuletzt gespielt" },
  { id: "title", label: "Name A–Z" },
];

const PAGE = 120;

function sortGames(list: Game[], sort: Sort) {
  const nullLast = (a: number | null, b: number | null, dir: 1 | -1) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return (a - b) * dir;
  };
  return [...list].sort((a, b) => {
    switch (sort) {
      case "playtime":
        return b.playtimeMin - a.playtimeMin || a.title.localeCompare(b.title);
      case "popularity":
        return nullLast(a.ratingCount, b.ratingCount, -1);
      case "rating":
        return nullLast(a.rating, b.rating, -1);
      case "duration-asc":
        return nullLast(a.ttbNormally, b.ttbNormally, 1);
      case "duration-desc":
        return nullLast(a.ttbNormally, b.ttbNormally, -1);
      case "recent":
        return (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? "");
      default:
        return a.title.localeCompare(b.title, "de");
    }
  });
}

export function Library() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const [q, setQ] = useState("");
  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [status, setStatus] = useState<Status>("open");
  const [ownership, setOwnership] = useState<Ownership>("owned");
  const [duration, setDuration] = useState<Duration>("any");
  const [onlyDupes, setOnlyDupes] = useState(false);
  const [sort, setSort] = useState<Sort>("playtime");
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    try {
      setData(await api<LibraryResponse>("/api/library"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten beim Start laden
    load();
  }, [load]);

  const games = useMemo(() => data?.games ?? [], [data]);
  const gamePassOn = data?.settings["gamepass.enabled"] === "1";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const dur = DURATIONS.find((d) => d.id === duration)!;
    const list = games.filter((g) => {
      if (needle && !g.title.toLowerCase().includes(needle)) return false;
      if (status === "open" && g.completed) return false;
      if (status === "completed" && !g.completed) return false;
      if (ownership === "owned" && !g.owned) return false;
      if (ownership === "gamepass" && !g.inGamePass) return false;
      if (onlyDupes && g.copies < 2) return false;
      if (platforms.length && !g.ownerships.some((o) => platforms.includes(o.platform))) return false;
      return dur.test(g.ttbNormally);
    });
    return sortGames(list, sort);
  }, [games, q, status, ownership, onlyDupes, platforms, duration, sort]);

  const presentPlatforms = useMemo(() => {
    const set = new Set(games.flatMap((g) => g.ownerships.map((o) => o.platform)));
    return PLATFORM_ORDER.filter((p) => set.has(p));
  }, [games]);

  const toggleCompleted = async (g: Game) => {
    setData((d) =>
      d ? { ...d, games: d.games.map((x) => (x.id === g.id ? { ...x, completed: !g.completed } : x)) } : d,
    );
    await api(`/api/games/${g.id}`, { method: "PATCH", body: { completed: !g.completed } }).catch(load);
    load();
  };

  const selectedGame = games.find((g) => g.id === selected) ?? null;
  const stats = data?.stats;

  if (error) return <Notice kind="error">Fehler beim Laden: {error}</Notice>;
  if (!data) return <LoadingGrid />;
  if (games.length === 0) return <Welcome onDemo={async () => (await api("/api/demo", { body: {} }), load())} />;

  return (
    <div className="space-y-6">
      {/* Kennzahlen */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Spiele in der Sammlung" value={stats!.owned} accent="from-violet-500/30" />
        <StatTile
          label="Mehrfach vorhanden"
          value={stats!.duplicates}
          accent="from-amber-400/30"
          onClick={() => {
            setOnlyDupes(true);
            setStatus("all");
          }}
        />
        <StatTile label="Durchgespielt" value={stats!.completed} accent="from-emerald-400/30" />
        <StatTile label="Gesamte Spielzeit" value={formatMinutes(stats!.playtimeMin)} accent="from-sky-400/30" />
        <StatTile
          label="Zusätzlich im Game Pass"
          value={gamePassOn ? stats!.gamePassOnly : "–"}
          accent="from-green-500/30"
          onClick={gamePassOn ? () => setOwnership("gamepass") : undefined}
        />
      </section>

      <SuggestPanel games={games} includeGamePass={gamePassOn} onOpen={(g) => setSelected(g.id)} />

      {/* Filter */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">⌕</span>
            <input
              className="input pl-8"
              placeholder="In der Sammlung suchen…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="open">Offene Spiele</option>
            <option value="all">Alle Spiele</option>
            <option value="completed">Durchgespielt</option>
          </select>
          {gamePassOn && (
            <select
              className="input w-auto"
              value={ownership}
              onChange={(e) => setOwnership(e.target.value as Ownership)}
            >
              <option value="owned">Nur gekaufte</option>
              <option value="all">Gekauft + Game Pass</option>
              <option value="gamepass">Nur Game Pass</option>
            </select>
          )}
          <select
            className="input w-auto"
            value={duration}
            onChange={(e) => setDuration(e.target.value as Duration)}
          >
            {DURATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                Sortieren: {s.label}
              </option>
            ))}
          </select>
          <button className="btn-ghost" onClick={() => setAdding(true)}>
            ＋ Spiel hinzufügen
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {presentPlatforms.map((p) => {
            const on = platforms.includes(p);
            return (
              <button
                key={p}
                className={`chip ${on ? "chip-on" : ""}`}
                style={on ? { borderColor: PLATFORMS[p].color, background: `${PLATFORMS[p].color}40` } : undefined}
                onClick={() => setPlatforms((ps) => (on ? ps.filter((x) => x !== p) : [...ps, p]))}
              >
                {PLATFORMS[p].label}
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px bg-white/10" />
          <button className={`chip ${onlyDupes ? "chip-on" : ""}`} onClick={() => setOnlyDupes((v) => !v)}>
            ×2 Nur doppelte
          </button>
          <span className="ml-auto text-xs text-white/40">
            {filtered.length} {filtered.length === 1 ? "Spiel" : "Spiele"}
          </span>
        </div>
      </section>

      {stats!.pendingEnrich > 0 && data.igdb && (
        <Notice kind="info">
          {stats!.pendingEnrich} Spiele haben noch keine Cover, Spieldauer oder Bewertung.{" "}
          <Link href="/setup#igdb" className="underline">
            Jetzt abrufen
          </Link>
        </Notice>
      )}

      {/* Raster */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-white/50">Keine Spiele für diese Filter.</div>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
          {filtered.slice(0, limit).map((g) => (
            <GameCard
              key={g.id}
              game={g}
              onOpen={() => setSelected(g.id)}
              onToggleCompleted={() => toggleCompleted(g)}
            />
          ))}
        </section>
      )}
      {filtered.length > limit && (
        <div className="text-center">
          <button className="btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Weitere {Math.min(PAGE, filtered.length - limit)} anzeigen
          </button>
        </div>
      )}

      <GameDetail
        key={selected ?? 0}
        game={selectedGame}
        igdb={data.igdb}
        onClose={() => setSelected(null)}
        onChanged={load}
      />
      <AddGameDialog open={adding} igdb={data.igdb} onClose={() => setAdding(false)} onAdded={load} />
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
  onClick,
}: {
  label: string;
  value: string | number;
  accent: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`card relative overflow-hidden bg-gradient-to-br ${accent} to-transparent p-4 text-left ${
        onClick ? "transition hover:border-white/25" : ""
      }`}
    >
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-white/55">{label}</div>
    </Tag>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-white/5" />
      ))}
    </div>
  );
}

function Welcome({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/25 via-[#0b0d14] to-emerald-500/15 px-6 py-16 text-center">
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="relative mx-auto max-w-xl space-y-5">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-emerald-400 text-2xl font-black text-black shadow-lg shadow-violet-500/30">
          NQ
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Willkommen bei NextQuest</h1>
        <p className="text-white/65">
          Alle deine Spiele von Steam, Xbox, Game Pass, PlayStation, GOG, Epic, Ubisoft und Switch an einem Ort – und
          die Antwort auf die Frage: <i>Was spiele ich als Nächstes?</i>
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/setup" className="btn-primary px-5 py-2.5">
            Einrichtung starten
          </Link>
          <button className="btn-ghost px-5 py-2.5" onClick={onDemo}>
            Erst mal mit Demo-Daten ansehen
          </button>
        </div>
      </div>
    </section>
  );
}
