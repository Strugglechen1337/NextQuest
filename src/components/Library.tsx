"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type LibraryResponse } from "@/lib/client";
import {
  countGenres,
  countPlaystyles,
  matchesGenreFilter,
  type CategoryCount,
  type GenreCategory,
  type PlaystyleCategory,
} from "@/lib/genres";
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
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [q, setQ] = useState("");
  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("open");
  const [ownership, setOwnership] = useState<Ownership>("owned");
  const [duration, setDuration] = useState<Duration>("any");
  const [onlyDupes, setOnlyDupes] = useState(false);
  const [sort, setSort] = useState<Sort>("playtime");
  const [limit, setLimit] = useState(PAGE);

  const toggleGenre = useCallback((label: string) => {
    setGenres((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await api<LibraryResponse>("/api/library"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Daten und optionale URL-Filter beim Start laden */
    const params = new URLSearchParams(window.location.search);
    if (params.get("filter") === "1" || params.get("sheet") === "1") {
      setFilterSheetOpen(true);
    }
    const urlGenres = params.get("genre") ?? params.get("genres");
    if (urlGenres) {
      setGenres(
        urlGenres
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const games = useMemo(() => data?.games ?? [], [data]);
  const gamePassOn = data?.settings["gamepass.enabled"] === "1";

  const activeFilterCount =
    (status !== "open" ? 1 : 0) +
    (gamePassOn && ownership !== "owned" ? 1 : 0) +
    (duration !== "any" ? 1 : 0) +
    (sort !== "playtime" ? 1 : 0) +
    platforms.length +
    genres.length +
    (onlyDupes ? 1 : 0);

  const resetFilters = () => {
    setStatus("open");
    setOwnership("owned");
    setDuration("any");
    setSort("playtime");
    setPlatforms([]);
    setGenres([]);
    setOnlyDupes(false);
  };

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
      if (genres.length && !matchesGenreFilter(g, genres)) return false;
      return dur.test(g.ttbNormally);
    });
    return sortGames(list, sort);
  }, [games, q, status, ownership, onlyDupes, platforms, genres, duration, sort]);

  const presentPlatforms = useMemo(() => {
    const set = new Set(games.flatMap((g) => g.ownerships.map((o) => o.platform)));
    return PLATFORM_ORDER.filter((p) => set.has(p));
  }, [games]);

  const presentGenres = useMemo(() => countGenres(games), [games]);
  const presentPlaystyles = useMemo(() => countPlaystyles(games), [games]);
  const suggestGames = useMemo(
    () => (genres.length > 0 ? games.filter((g) => matchesGenreFilter(g, genres)) : games),
    [games, genres],
  );

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
    <div className="min-w-0 max-w-full space-y-[var(--space-section)]">
      {/* Kennzahlen */}
      <section className="stats-grid" aria-label="Sammlungs-Kennzahlen">
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
          wideOnMobile
          onClick={gamePassOn ? () => setOwnership("gamepass") : undefined}
        />
      </section>

      <SuggestPanel
        games={suggestGames}
        includeGamePass={gamePassOn}
        activeGenres={genres}
        onOpen={(g) => setSelected(g.id)}
      />

      {/* Filter: Handy / Tablet (< lg) */}
      <section className="space-y-2.5 lg:hidden" aria-label="Suche und Filter">
        <div className="relative w-full">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35">⌕</span>
          <input
            className="input w-full pl-8 pr-9"
            aria-label="In der Sammlung suchen"
            placeholder="In der Sammlung suchen…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Suche löschen"
              className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-white/45 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`btn-ghost shrink-0 whitespace-nowrap ${
              activeFilterCount > 0 ? "border-violet-400/60 bg-violet-500/15 text-white" : ""
            }`}
            onClick={() => setFilterSheetOpen(true)}
          >
            <svg className="h-4 w-4 opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
            </svg>
            <span>Filter</span>
            <span
              className={`ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold ${
                activeFilterCount > 0 ? "bg-violet-500 text-white" : "bg-white/10 text-white/65"
              }`}
            >
              {activeFilterCount}
            </span>
          </button>

          {activeFilterCount > 0 && (
            <button type="button" className="btn-ghost shrink-0 whitespace-nowrap px-3 text-xs" onClick={resetFilters}>
              Zurücksetzen
            </button>
          )}

          <button type="button" className="btn-ghost shrink-0 whitespace-nowrap" onClick={() => setAdding(true)}>
            ＋ Spiel hinzufügen
          </button>

          <span className="ml-auto text-xs whitespace-nowrap text-white/50">
            {filtered.length} {filtered.length === 1 ? "Spiel" : "Spiele"}
          </span>
        </div>
      </section>

      {/* Filter: PC (ab lg) – in einer aufgeräumten Zeile, Chips darunter */}
      <section className="hidden space-y-3 lg:block" aria-label="Suche und Filter">
        <div className="flex items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35">⌕</span>
            <input
              className="input pl-8"
              aria-label="In der Sammlung suchen"
              placeholder="In der Sammlung suchen…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="input w-auto shrink-0"
            aria-label="Status filtern"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            <option value="open">Offene Spiele</option>
            <option value="all">Alle Spiele</option>
            <option value="completed">Durchgespielt</option>
          </select>
          {gamePassOn && (
            <select
              className="input w-auto shrink-0"
              aria-label="Besitz filtern"
              value={ownership}
              onChange={(e) => setOwnership(e.target.value as Ownership)}
            >
              <option value="owned">Nur gekaufte</option>
              <option value="all">Gekauft + Game Pass</option>
              <option value="gamepass">Nur Game Pass</option>
            </select>
          )}
          <select
            className="input w-auto shrink-0"
            aria-label="Spieldauer filtern"
            value={duration}
            onChange={(e) => setDuration(e.target.value as Duration)}
          >
            {DURATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <select
            className="input w-auto shrink-0"
            aria-label="Sortierung"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                Sortieren: {s.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost shrink-0" onClick={() => setAdding(true)}>
            ＋ Spiel hinzufügen
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {presentPlatforms.map((p) => {
            const on = platforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                className={`chip ${on ? "chip-on" : ""}`}
                style={on ? { borderColor: PLATFORMS[p].color, background: `${PLATFORMS[p].color}40` } : undefined}
                onClick={() => setPlatforms((ps) => (on ? ps.filter((x) => x !== p) : [...ps, p]))}
              >
                {PLATFORMS[p].label}
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px bg-white/10" />
          <button
            type="button"
            className={`chip ${onlyDupes ? "chip-on" : ""}`}
            onClick={() => setOnlyDupes((v) => !v)}
          >
            ×2 Nur doppelte
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="chip border-violet-400/40 text-violet-300 hover:border-violet-400 hover:text-white"
              onClick={resetFilters}
            >
              ↺ Filter zurücksetzen ({activeFilterCount})
            </button>
          )}
          <span className="ml-auto text-xs text-white/45">
            {filtered.length} {filtered.length === 1 ? "Spiel" : "Spiele"}
          </span>
        </div>

        {(presentGenres.length > 0 || presentPlaystyles.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Genre und Spielweise filtern">
            {presentGenres.map(({ label, count }) => {
              const on = genres.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  className={`chip gap-1.5 ${on ? "chip-on" : ""}`}
                  onClick={() => toggleGenre(label)}
                >
                  <span>{label}</span>
                  <span className={`text-[11px] tabular-nums ${on ? "text-violet-200" : "text-white/45"}`}>{count}</span>
                </button>
              );
            })}
            {presentGenres.length > 0 && presentPlaystyles.length > 0 && (
              <span className="mx-1 h-4 w-px bg-white/10" />
            )}
            {presentPlaystyles.map(({ label, count }) => {
              const on = genres.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  className={`chip gap-1.5 ${on ? "chip-on" : ""}`}
                  onClick={() => toggleGenre(label)}
                >
                  <span>{label}</span>
                  <span className={`text-[11px] tabular-nums ${on ? "text-violet-200" : "text-white/45"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {stats!.pendingEnrich > 0 && data.igdb && (
        <Notice kind="info">
          {stats!.pendingEnrich} Spiele haben noch keine Cover, Spieldauer oder Bewertung.{" "}
          <Link href="/setup#igdb" className="underline">
            Jetzt abrufen
          </Link>
        </Notice>
      )}

      {genres.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Aktive Genre-Filter">
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              className="chip chip-on gap-1.5"
              onClick={() => toggleGenre(g)}
              aria-label={`Genre-Filter ${g} entfernen`}
            >
              <span>{g}</span>
              <span aria-hidden="true" className="text-violet-200">
                ✕
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Raster */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-white/55">Keine Spiele für diese Filter.</div>
      ) : (
        <section className="game-grid" aria-label="Spieleliste">
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
          <button type="button" className="btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Weitere {Math.min(PAGE, filtered.length - limit)} anzeigen
          </button>
        </div>
      )}

      <FilterBottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        status={status}
        setStatus={setStatus}
        gamePassOn={gamePassOn}
        ownership={ownership}
        setOwnership={setOwnership}
        duration={duration}
        setDuration={setDuration}
        sort={sort}
        setSort={setSort}
        presentPlatforms={presentPlatforms}
        platforms={platforms}
        setPlatforms={setPlatforms}
        presentGenres={presentGenres}
        presentPlaystyles={presentPlaystyles}
        genres={genres}
        onToggleGenre={toggleGenre}
        onlyDupes={onlyDupes}
        setOnlyDupes={setOnlyDupes}
        activeFilterCount={activeFilterCount}
        onReset={resetFilters}
        resultCount={filtered.length}
      />

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

function FilterBottomSheet({
  open,
  onClose,
  status,
  setStatus,
  gamePassOn,
  ownership,
  setOwnership,
  duration,
  setDuration,
  sort,
  setSort,
  presentPlatforms,
  platforms,
  setPlatforms,
  presentGenres,
  presentPlaystyles,
  genres,
  onToggleGenre,
  onlyDupes,
  setOnlyDupes,
  activeFilterCount,
  onReset,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  status: Status;
  setStatus: (s: Status) => void;
  gamePassOn: boolean;
  ownership: Ownership;
  setOwnership: (o: Ownership) => void;
  duration: Duration;
  setDuration: (d: Duration) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
  presentPlatforms: PlatformId[];
  platforms: PlatformId[];
  setPlatforms: React.Dispatch<React.SetStateAction<PlatformId[]>>;
  presentGenres: CategoryCount<GenreCategory>[];
  presentPlaystyles: CategoryCount<PlaystyleCategory>[];
  genres: string[];
  onToggleGenre: (label: string) => void;
  onlyDupes: boolean;
  setOnlyDupes: React.Dispatch<React.SetStateAction<boolean>>;
  activeFilterCount: number;
  onReset: () => void;
  resultCount: number;
}) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filter und Sortierung"
        className="flex max-h-[min(92dvh,48rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border-t border-white/15 bg-[#11141d] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#11141d]/95 px-4 py-2.5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-bold sm:text-base">Filter & Sortierung</h2>
            <span
              className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeFilterCount > 0 ? "bg-violet-500/25 text-violet-200" : "bg-white/10 text-white/60"
              }`}
            >
              {activeFilterCount} aktiv
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={activeFilterCount === 0}
              onClick={onReset}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-300 transition hover:bg-white/10 disabled:opacity-40"
            >
              Zurücksetzen
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Filter schließen"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-white/60">Status</span>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                <option value="open">Offene Spiele</option>
                <option value="all">Alle Spiele</option>
                <option value="completed">Durchgespielt</option>
              </select>
            </label>

            {gamePassOn && (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-white/60">Besitz / Game Pass</span>
                <select className="input" value={ownership} onChange={(e) => setOwnership(e.target.value as Ownership)}>
                  <option value="owned">Nur gekaufte</option>
                  <option value="all">Gekauft + Game Pass</option>
                  <option value="gamepass">Nur Game Pass</option>
                </select>
              </label>
            )}

            <label className="block space-y-1">
              <span className="text-xs font-medium text-white/60">Spieldauer</span>
              <select className="input" value={duration} onChange={(e) => setDuration(e.target.value as Duration)}>
                {DURATIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-white/60">Sortierung</span>
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {presentGenres.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-white/60">Genre</div>
              <div className="flex flex-wrap gap-1.5">
                {presentGenres.map(({ label, count }) => {
                  const on = genres.includes(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`chip gap-1.5 ${on ? "chip-on" : ""}`}
                      onClick={() => onToggleGenre(label)}
                    >
                      <span>{label}</span>
                      <span className={`text-[11px] tabular-nums ${on ? "text-violet-200" : "text-white/45"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {presentPlaystyles.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-white/60">Spielweise</div>
              <div className="flex flex-wrap gap-1.5">
                {presentPlaystyles.map(({ label, count }) => {
                  const on = genres.includes(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`chip gap-1.5 ${on ? "chip-on" : ""}`}
                      onClick={() => onToggleGenre(label)}
                    >
                      <span>{label}</span>
                      <span className={`text-[11px] tabular-nums ${on ? "text-violet-200" : "text-white/45"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-white/60">Plattformen</div>
            <div className="flex flex-wrap gap-1.5">
              {presentPlatforms.map((p) => {
                const on = platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className={`chip ${on ? "chip-on" : ""}`}
                    style={on ? { borderColor: PLATFORMS[p].color, background: `${PLATFORMS[p].color}40` } : undefined}
                    onClick={() => setPlatforms((ps) => (on ? ps.filter((x) => x !== p) : [...ps, p]))}
                  >
                    {PLATFORMS[p].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-white/60">Weitere Optionen</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={`chip ${onlyDupes ? "chip-on" : ""}`}
                onClick={() => setOnlyDupes((v) => !v)}
              >
                ×2 Nur doppelte
              </button>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-20 flex shrink-0 items-center gap-2 border-t border-white/10 bg-[#11141d]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <button type="button" className="btn-ghost" disabled={activeFilterCount === 0} onClick={onReset}>
            Zurücksetzen
          </button>
          <button type="button" className="btn-primary flex-1" onClick={onClose}>
            {resultCount} {resultCount === 1 ? "Spiel" : "Spiele"} anzeigen
          </button>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
  wideOnMobile,
  onClick,
}: {
  label: string;
  value: string | number;
  accent: string;
  wideOnMobile?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`@container card relative overflow-hidden bg-gradient-to-br ${accent} to-transparent px-2.5 py-1.5 text-left sm:p-3.5 ${
        wideOnMobile ? "max-[520px]:col-span-2 max-[520px]:flex max-[520px]:items-center max-[520px]:justify-between max-[520px]:gap-2" : ""
      } ${
        onClick
          ? "transition hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
          : ""
      }`}
    >
      <div
        className={`text-[clamp(1rem,1.9vw,1.5rem)] font-bold leading-tight tabular-nums ${
          wideOnMobile ? "max-[520px]:order-2" : ""
        }`}
      >
        {value}
      </div>
      <div className="truncate text-[11px] text-white/60 sm:text-xs">{label}</div>
    </Tag>
  );
}

function LoadingGrid() {
  return (
    <div className="game-grid">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-white/5" />
      ))}
    </div>
  );
}

function Welcome({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/25 via-[#0b0d14] to-emerald-500/15 px-5 py-12 text-center sm:px-6 sm:py-16">
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="relative mx-auto max-w-xl space-y-5">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-emerald-400 text-2xl font-black text-black shadow-lg shadow-violet-500/30">
          NQ
        </div>
        <h1 className="text-[clamp(1.6rem,4vw,2.35rem)] font-bold tracking-tight">Willkommen bei NextQuest</h1>
        <p className="text-sm text-white/65 sm:text-base">
          Alle deine Spiele von Steam, Xbox, Game Pass, PlayStation, GOG, Epic, Ubisoft und Switch an einem Ort – und
          die Antwort auf die Frage: <i>Was spiele ich als Nächstes?</i>
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/setup" className="btn-primary px-5 py-2.5">
            Einrichtung starten
          </Link>
          <button type="button" className="btn-ghost px-5 py-2.5" onClick={onDemo}>
            Erst mal mit Demo-Daten ansehen
          </button>
        </div>
      </div>
    </section>
  );
}
