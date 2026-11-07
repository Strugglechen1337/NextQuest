"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type LibraryResponse } from "@/lib/client";
import { computeLibraryStatistics } from "@/lib/stats";
import { formatMinutes } from "@/lib/suggest";
import type { Game } from "@/lib/types";
import { platformsOf } from "./GameCard";
import { GameDetail } from "./GameDetail";
import { Cover, Notice, PlatformPill } from "./ui";

export function Stats() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [genreMode, setGenreMode] = useState<"playtime" | "count">("playtime");

  const load = useCallback(async () => {
    try {
      setData(await api<LibraryResponse>("/api/library"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Bibliotheksdaten beim Seitenaufruf laden */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const games = useMemo(() => data?.games ?? [], [data]);
  const computed = useMemo(() => (data ? computeLibraryStatistics(data.games) : null), [data]);
  const selectedGame: Game | null = useMemo(
    () => games.find((g) => g.id === selectedId) ?? null,
    [games, selectedId],
  );

  if (error) return <Notice kind="error">Fehler beim Laden: {error}</Notice>;
  if (!data || !computed) return <StatsSkeleton />;

  if (games.length === 0) {
    return (
      <section className="card p-8 text-center sm:p-12">
        <h1 className="text-xl font-bold sm:text-2xl">Noch keine Statistik-Daten vorhanden</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
          Verbinde deine Plattformen in der Einrichtung oder lade die Demo-Sammlung, um Auswertungen zu Spielzeit,
          Plattformen und Pile of Shame zu sehen.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/setup" className="btn-primary">
            Zur Einrichtung
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              await api("/api/demo", { body: {} });
              load();
            }}
          >
            Demo-Daten laden
          </button>
        </div>
      </section>
    );
  }

  const { kpis, byPlatform, byGenre, byGenreCount, topPlayed, byDuration, unknownDurationCount, byMonth } = computed;
  const activeGenreList = genreMode === "playtime" ? byGenre : byGenreCount;
  const maxPlatformPlaytime = Math.max(1, ...byPlatform.map((p) => p.playtimeMin));
  const maxGenreValue = Math.max(
    1,
    ...activeGenreList.map((g) => (genreMode === "playtime" ? g.playtimeMin : g.gameCount)),
  );
  const maxTopPlaytime = Math.max(1, ...topPlayed.map((g) => g.playtimeMin));
  const maxDurationCount = Math.max(1, ...byDuration.map((d) => d.count));
  const maxMonthCount = Math.max(1, ...byMonth.map((m) => m.count));
  const totalActiveLast12M = byMonth.reduce((s, m) => s + m.count, 0);

  return (
    <div className="min-w-0 max-w-full space-y-[var(--space-section)]">
      {/* Kopfbereich */}
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[clamp(1.25rem,2.2vw,1.65rem)] font-bold tracking-tight">Sammlungs-Statistik</h1>
          <p className="text-xs text-white/60 sm:text-sm">
            Überblick über Spielzeit, Pile of Shame, Plattformen und Genres deiner Bibliothek
          </p>
        </div>
      </header>

      {/* Kennzahlen */}
      <section
        className="stats-grid"
        aria-label="Statistik-Kennzahlen"
      >
        <KpiCard
          label="Spiele gesamt"
          value={kpis.total.toLocaleString("de-DE")}
          sub={
            kpis.gamePassOnly > 0
              ? `${kpis.owned} gekauft · ${kpis.gamePassOnly} Game Pass`
              : `${kpis.owned} in deiner Sammlung`
          }
          accent="from-violet-500/30"
        />
        <KpiCard
          label="Durchgespielt"
          value={`${kpis.completed} (${kpis.completionRatePercent} %)`}
          sub={`${kpis.openCount} noch offen`}
          accent="from-emerald-400/30"
        />
        <KpiCard
          label="Gesamtspielzeit"
          value={formatMinutes(kpis.totalPlaytimeMin)}
          sub={
            kpis.total > 0
              ? `Ø ${formatMinutes(Math.round(kpis.totalPlaytimeMin / kpis.total))} pro Spiel`
              : "Keine Spielzeit"
          }
          accent="from-sky-400/30"
        />
        <KpiCard
          label="Pile of Shame (ungespielt)"
          value={kpis.pileOfShameCount.toLocaleString("de-DE")}
          sub={`ca. ${formatMinutes(kpis.remainingTtbMin)} bis alles durchgespielt`}
          accent="from-rose-500/30"
        />
        <KpiCard
          label="Mehrfachkäufe"
          value={kpis.duplicatesCount.toLocaleString("de-DE")}
          sub={
            kpis.extraCopiesCount > 0
              ? `${kpis.extraCopiesCount} zusätzliche ${kpis.extraCopiesCount === 1 ? "Kopie" : "Kopien"}`
              : "Keine doppelten Spiele"
          }
          accent="from-amber-400/30"
          wideOnMobile
        />
      </section>

      {/* Banner: Geschätzte Stunden für alle offenen Spiele */}
      <section
        className="@container card relative overflow-hidden bg-gradient-to-r from-violet-500/15 via-white/[0.02] to-emerald-500/15 p-3.5 sm:p-4"
        aria-label="Pile of Shame Auswertung"
      >
        <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:justify-between">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold sm:text-base">
              Geschätzte Dauer bis alles durchgespielt ist:{" "}
              <span className="text-emerald-300 tabular-nums">{formatMinutes(kpis.remainingTtbMin)}</span>
            </div>
            <p className="text-xs text-white/60">
              Summe der Hauptstory-Dauer ({kpis.openWithKnownDurationCount} offene Spiele mit bekannter Spieldauer) ·{" "}
              {kpis.pileOfShameCount} {kpis.pileOfShameCount === 1 ? "Spiel" : "Spiele"} davon noch komplett ungespielt
              („Pile of Shame“)
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-white/70">
            <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 tabular-nums">
              Offen: <b className="text-white">{kpis.openCount}</b>
            </span>
            <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 tabular-nums">
              Ungespielt: <b className="text-white">{kpis.pileOfShameCount}</b>
            </span>
          </div>
        </div>
      </section>

      {/* Haupt-Diagramme: Plattformen & Genres */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 1. Spielzeit pro Plattform */}
        <section className="@container card flex min-w-0 flex-col overflow-hidden p-4 sm:p-5" aria-labelledby="chart-platforms-title">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <div>
              <h2 id="chart-platforms-title" className="text-base font-bold sm:text-lg">
                Spielzeit pro Plattform
              </h2>
              <p className="text-xs text-white/55">Verteilung deiner erfassten Spielstunden nach System</p>
            </div>
            <span className="text-xs text-white/50 tabular-nums">{byPlatform.length} Plattformen</span>
          </div>

          <div
            role="img"
            aria-label={`Balkendiagramm Spielzeit pro Plattform: ${byPlatform
              .map((p) => `${p.label} ${formatMinutes(p.playtimeMin)} (${p.gameCount} Spiele)`)
              .join(", ")}`}
            className="space-y-3"
          >
            {byPlatform.map((p) => {
              const widthPct = p.playtimeMin > 0 ? Math.max(3, Math.round((p.playtimeMin / maxPlatformPlaytime) * 100)) : 0;
              return (
                <div key={p.platform} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <PlatformPill platform={p.platform} size="md" />
                      <span className="truncate text-xs text-white/55 tabular-nums">
                        {p.gameCount} {p.gameCount === 1 ? "Spiel" : "Spiele"}
                      </span>
                    </div>
                    <div className="shrink-0 font-semibold tabular-nums">
                      {formatMinutes(p.playtimeMin)}{" "}
                      <span className="text-xs font-normal text-white/50">({p.sharePercent} %)</span>
                    </div>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                    <svg
                      className=" block h-full w-full"
                      viewBox="0 0 100 10"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <rect
                        x="0"
                        y="0"
                        width={widthPct}
                        height="10"
                        rx="5"
                        fill={p.color}
                      />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 2. Spiele / Spielzeit pro Genre (Top 10) */}
        <section className="@container card flex min-w-0 flex-col overflow-hidden p-4 sm:p-5" aria-labelledby="chart-genres-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="chart-genres-title" className="text-base font-bold sm:text-lg">
                Top 10 Genres
              </h2>
              <p className="text-xs text-white/55">
                Klick auf ein Genre öffnet die gefilterte Bibliothek
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setGenreMode("playtime")}
                aria-pressed={genreMode === "playtime"}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  genreMode === "playtime" ? "bg-violet-500 text-white" : "text-white/65 hover:text-white"
                }`}
              >
                Spielzeit
              </button>
              <button
                type="button"
                onClick={() => setGenreMode("count")}
                aria-pressed={genreMode === "count"}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  genreMode === "count" ? "bg-violet-500 text-white" : "text-white/65 hover:text-white"
                }`}
              >
                Spiele
              </button>
            </div>
          </div>

          {activeGenreList.length === 0 ? (
            <div className="py-8 text-center text-sm text-white/50">Noch keine Genre-Daten vorhanden.</div>
          ) : (
            <div
              role="list"
              aria-label="Top 10 Genres nach Spielzeit und Anzahl"
              className="space-y-2"
            >
              {activeGenreList.map((g) => {
                const metric = genreMode === "playtime" ? g.playtimeMin : g.gameCount;
                const widthPct = metric > 0 ? Math.max(4, Math.round((metric / maxGenreValue) * 100)) : 0;
                return (
                  <Link
                    key={g.genre}
                    role="listitem"
                    href={`/?genre=${encodeURIComponent(g.genre)}`}
                    aria-label={`${g.genre}: ${g.gameCount} Spiele, ${formatMinutes(g.playtimeMin)} Spielzeit – in der Bibliothek filtern`}
                    className="group block rounded-xl border border-transparent px-2 py-1.5 transition hover:border-violet-400/40 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs sm:text-sm">
                      <span className="flex min-w-0 items-center gap-1.5 font-medium group-hover:text-violet-200">
                        <span className="truncate">{g.genre}</span>
                        <span className="text-xs text-white/35 transition group-hover:translate-x-0.5 group-hover:text-violet-300">
                          →
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-white/70 tabular-nums">
                        <b className="text-white">{formatMinutes(g.playtimeMin)}</b> · {g.gameCount}{" "}
                        {g.gameCount === 1 ? "Spiel" : "Spiele"}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Untere Diagramme: Spieldauer-Verteilung & Zuletzt aktiv (letzte 12 Monate) */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 4. Verteilung der Spieldauer */}
        <section className="@container card flex min-w-0 flex-col overflow-hidden p-4 sm:p-5" aria-labelledby="chart-duration-title">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <div>
              <h2 id="chart-duration-title" className="text-base font-bold sm:text-lg">
                Verteilung der Spieldauer
              </h2>
              <p className="text-xs text-white/55">Hauptstory-Länge deiner Spiele laut IGDB</p>
            </div>
            {unknownDurationCount > 0 && (
              <span className="text-xs text-white/45 tabular-nums">{unknownDurationCount} ohne Angabe</span>
            )}
          </div>

          <div
            role="img"
            aria-label={`Verteilung der Spieldauer: ${byDuration
              .map((b) => `${b.label}: ${b.count} Spiele (${b.sharePercent} %)`)
              .join(", ")}`}
            className="space-y-3.5"
          >
            {byDuration.map((b) => {
              const widthPct = b.count > 0 ? Math.max(4, Math.round((b.count / maxDurationCount) * 100)) : 0;
              return (
                <div key={b.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                    <span className="font-medium">{b.label}</span>
                    <span className="text-white/75 tabular-nums">
                      <b className="text-white">{b.count}</b> {b.count === 1 ? "Spiel" : "Spiele"}{" "}
                      <span className="text-xs text-white/50">
                        ({b.sharePercent} % · {b.completedCount} durch)
                      </span>
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500 transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. Zuletzt aktiv (Spiele pro Monat nach lastPlayed, letzte 12 Monate) */}
        <section className="@container card flex min-w-0 flex-col overflow-hidden p-4 sm:p-5" aria-labelledby="chart-activity-title">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <div>
              <h2 id="chart-activity-title" className="text-base font-bold sm:text-lg">
                Zuletzt aktiv (letzte 12 Monate)
              </h2>
              <p className="text-xs text-white/55">Anzahl gespielter Titel nach Monat des letzten Starts</p>
            </div>
            <span className="text-xs text-white/50 tabular-nums">{totalActiveLast12M} aktiv</span>
          </div>

          <div
            role="img"
            aria-label={`Spiele pro Monat in den letzten 12 Monaten: ${byMonth
              .map((m) => `${m.fullLabel}: ${m.count}`)
              .join(", ")}`}
            className="flex flex-1 flex-col justify-end pt-2"
          >
            <svg
              viewBox="0 0 360 150"
              className="h-40 w-full overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="nq-month-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              {/* Horizontale Hilfslinien */}
              <line x1="0" y1="22" x2="360" y2="22" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
              <line x1="0" y1="72" x2="360" y2="72" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
              <line x1="0" y1="122" x2="360" y2="122" stroke="rgba(255,255,255,0.15)" />

              {byMonth.map((m, idx) => {
                const slotW = 360 / 12;
                const barW = 18;
                const x = idx * slotW + (slotW - barW) / 2;
                const maxH = 96;
                const barH = m.count > 0 ? Math.max(6, Math.round((m.count / maxMonthCount) * maxH)) : 2;
                const y = 122 - barH;
                return (
                  <g key={m.key}>
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx="4"
                      fill={m.count > 0 ? "url(#nq-month-bar)" : "rgba(255,255,255,0.12)"}
                    >
                      <title>{`${m.fullLabel}: ${m.count} ${m.count === 1 ? "Spiel" : "Spiele"}`}</title>
                    </rect>
                    {m.count > 0 && (
                      <text
                        x={x + barW / 2}
                        y={y - 5}
                        textAnchor="middle"
                        className="fill-white/85 text-[9px] font-semibold"
                      >
                        {m.count}
                      </text>
                    )}
                    <text
                      x={x + barW / 2}
                      y={138}
                      textAnchor="middle"
                      className="fill-white/55 text-[9px]"
                    >
                      {m.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>
      </div>

      {/* 3. Top 10 meistgespielte Spiele */}
      <section className="@container card p-4 sm:p-5" aria-labelledby="chart-top-games-title">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <div>
            <h2 id="chart-top-games-title" className="text-base font-bold sm:text-lg">
              Top 10 meistgespielte Spiele
            </h2>
            <p className="text-xs text-white/55">Deine größten Zeitfresser über alle Plattformen hinweg</p>
          </div>
          <span className="text-xs text-white/50 tabular-nums">Top {topPlayed.length}</span>
        </div>

        {topPlayed.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/50">Noch keine Spiele mit erfasster Spielzeit.</div>
        ) : (
          <ol className="grid grid-cols-1 gap-2.5 @3xl:grid-cols-2" aria-label="Top 10 meistgespielte Spiele">
            {topPlayed.map((game, idx) => {
              const widthPct = Math.max(4, Math.round((game.playtimeMin / maxTopPlaytime) * 100));
              const platforms = platformsOf(game);
              return (
                <li key={game.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(game.id)}
                    aria-label={`Platz ${idx + 1}: ${game.title}, ${formatMinutes(game.playtimeMin)}`}
                    className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-left transition hover:border-violet-400/50 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-bold text-white/80 tabular-nums">
                      {idx + 1}
                    </span>
                    <Cover
                      src={game.coverUrl}
                      fallbacks={game.coverFallbacks}
                      title={game.title}
                      className="h-14 w-10 shrink-0 rounded-md text-xs"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold group-hover:text-violet-200">
                            {game.title}
                          </span>
                          {game.completed && (
                            <span
                              title="Durchgespielt"
                              className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300"
                            >
                              ✓
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-xs font-bold text-white tabular-nums sm:text-sm">
                          {formatMinutes(game.playtimeMin)}
                        </span>
                      </div>

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex flex-wrap gap-1">
                          {platforms.map((p) => (
                            <PlatformPill key={p} platform={p} />
                          ))}
                        </div>
                        {game.ttbNormally && (
                          <span className="text-[11px] text-white/45 tabular-nums">
                            Hauptstory: {formatMinutes(game.ttbNormally)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <GameDetail
        key={selectedId ?? 0}
        game={selectedGame}
        igdb={data.igdb}
        onClose={() => setSelectedId(null)}
        onChanged={load}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  wideOnMobile,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  wideOnMobile?: boolean;
}) {
  return (
    <div
      className={`@container card relative min-w-0 overflow-hidden bg-gradient-to-br ${accent} to-transparent px-2.5 py-2 text-left sm:p-3.5 ${
        wideOnMobile ? "max-[520px]:col-span-2" : ""
      }`}
    >
      <div className="text-[clamp(1rem,1.9vw,1.5rem)] font-bold leading-tight tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[11px] font-medium text-white/80 sm:text-xs">{label}</div>
      <div className="mt-0.5 truncate text-[10px] text-white/55 sm:text-[11px]">{sub}</div>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-72 animate-pulse rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}
