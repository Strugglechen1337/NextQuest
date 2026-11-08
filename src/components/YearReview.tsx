"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { formatMinutes } from "@/lib/suggest";
import type { Game } from "@/lib/types";
import {
  computeYearReview,
  type PlaytimeSnapshotRow,
  type AchievementUnlockRow,
  type YearReviewData,
} from "@/lib/year-review";
import { platformsOf } from "./GameCard";
import { GameDetail } from "./GameDetail";
import { Cover, Modal, Notice, PlatformPill } from "./ui";
import type { ShareImageFormat } from "@/lib/share-image";

interface YearReviewApiResponse {
  review: YearReviewData;
  snapshots: PlaytimeSnapshotRow[];
  unlocks: AchievementUnlockRow[];
  games: Game[];
  igdb: boolean;
}

export function YearReview({ embedded = false }: { embedded?: boolean }) {
  const [payload, setPayload] = useState<YearReviewApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFormat, setShareFormat] = useState<ShareImageFormat>("story");
  const [sharingBusy, setSharingBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<YearReviewApiResponse>("/api/stats/year");
      setPayload(res);
      setSelectedYear((prev) => prev ?? res.review.year);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Daten für den Jahresrückblick beim Seitenaufruf laden */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const review: YearReviewData | null = useMemo(() => {
    if (!payload) return null;
    return computeYearReview(payload.games, payload.snapshots, selectedYear ?? payload.review.year, new Date(), payload.unlocks ?? []);
  }, [payload, selectedYear]);

  const selectedGame = useMemo(
    () => payload?.games.find((g) => g.id === selectedGameId) ?? null,
    [payload, selectedGameId],
  );

  if (error) return <Notice kind="error">Fehler beim Laden: {error}</Notice>;
  if (!payload || !review) return <YearReviewSkeleton />;

  if (payload.games.length === 0) {
    return (
      <section className="card p-8 text-center sm:p-12">
        <h1 className="text-xl font-bold sm:text-2xl">Noch keine Daten für deinen Jahresrückblick</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
          Lade deine Spielebibliothek oder die Demo-Sammlung, um deinen persönlichen Jahresrückblick im „Wrapped“-Stil
          zu erleben.
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

  const {
    year,
    availableYears,
    playtimeSource,
    firstSnapshot,
    playtimeMin,
    activeGamesCount,
    completedGames,
    longestCompleted,
    shortestCompleted,
    mostPlayedGame,
    topGenre,
    genres,
    topPlatform,
    platforms,
    newGamesCount,
    newGames,
    byMonth,
    collageGames,
  } = review;

  const maxMonthActivity = Math.max(1, ...byMonth.map((m) => Math.max(m.activeCount, m.completedCount)));
  const maxGenrePlaytime = Math.max(1, ...genres.map((g) => g.playtimeMin));
  const maxPlatformPlaytime = Math.max(1, ...platforms.map((p) => p.playtimeMin));

  const scrollToSlide = (idx: number) => {
    const el = deckRef.current;
    if (!el) return;
    const card = el.children[idx] as HTMLElement | undefined;
    if (card) {
      el.scrollTo({ left: card.offsetLeft - 12, behavior: "smooth" });
      setActiveSlide(idx);
    }
  };

  const handleDeckScroll = () => {
    const el = deckRef.current;
    if (!el || el.clientWidth === 0) return;
    const idx = Math.round(el.scrollLeft / (el.clientWidth * 0.82));
    setActiveSlide(Math.max(0, Math.min(4, idx)));
  };

  const shareImageUrl = `/api/stats/year/share-image?year=${year}&format=${shareFormat}`;

  const downloadSharePng = async (fmt: ShareImageFormat = shareFormat) => {
    setSharingBusy(true);
    setShareStatus(null);
    try {
      const res = await fetch(`/api/stats/year/share-image?year=${year}&format=${fmt}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Bild konnte nicht erzeugt werden.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nextquest-wrapped-${year}-${fmt}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setShareStatus("PNG-Bild wurde heruntergeladen.");
    } catch (e) {
      setShareStatus((e as Error).message);
    } finally {
      setSharingBusy(false);
    }
  };

  const triggerShareOrDownload = async (fmt: ShareImageFormat = shareFormat) => {
    setSharingBusy(true);
    setShareStatus(null);
    try {
      const res = await fetch(`/api/stats/year/share-image?year=${year}&format=${fmt}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Bild konnte nicht erzeugt werden.");
      const blob = await res.blob();
      const filename = `nextquest-wrapped-${year}-${fmt}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          title: `Mein NextQuest Spieljahr ${year}`,
          text: `Mein Spieljahr ${year} in NextQuest: ${playtimeSource === "unbekannt" ? "unbekannte Spielzeit" : `${playtimeSource === "geschätzt (Erfolge)" ? "ca. " : ""}${formatMinutes(playtimeMin)} Spielzeit`} & ${completedGames.length} durchgespielte Spiele!`,
          files: [file],
        });
        setShareStatus("Jahresrückblick erfolgreich geteilt.");
        return;
      }

      // Fallback (z. B. PC ohne Datei-Web-Share): Bild herunterladen
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setShareStatus("Teilen im Browser nicht direkt verfügbar – PNG-Bild wurde heruntergeladen.");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setShareStatus(null);
      } else {
        setShareStatus((e as Error).message);
      }
    } finally {
      setSharingBusy(false);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-[var(--space-section)]">
      {/* Kopfzeile + Jahresauswahl */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          {!embedded && (
            <div className="flex items-center gap-2 text-xs text-white/55">
              <Link href="/stats" className="hover:text-violet-300">
                ← Zurück zur Sammlungs-Statistik
              </Link>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center rounded-full border border-violet-400/40 bg-gradient-to-r from-violet-500/30 to-emerald-400/30 px-2.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
              NextQuest Wrapped
            </span>
            <h1 className="text-[clamp(1.3rem,2.4vw,1.85rem)] font-black tracking-tight">
              Dein Spieljahr {year}
            </h1>
          </div>
          <p className="text-xs text-white/60 sm:text-sm">
            Durchgespielte Highlights, Spielstunden, Lieblingsgenre und Plattformen im Rückblick
          </p>
        </div>

        {/* Jahresauswahl & Teilen-Knopf */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Jahr auswählen">
            {availableYears.map((y) => {
              const active = y === year;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSelectedYear(y)}
                  aria-pressed={active}
                  className={`rounded-xl border px-3.5 py-1.5 text-sm font-bold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80 ${
                    active
                      ? "border-violet-400 bg-gradient-to-r from-violet-500 to-emerald-500 text-black shadow-md shadow-violet-500/25"
                      : "border-white/10 bg-white/5 text-white/75 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {y}
                </button>
              );
            })}
          </div>

          {process.env.NEXT_PUBLIC_DEMO === "1" ? <span className="text-xs text-white/55">Das Teilen-Bild ist in der Demo nicht verfügbar.</span> : <button
            type="button"
            onClick={() => {
              setShareStatus(null);
              setShareOpen(true);
            }}
            className="btn-primary text-xs sm:text-sm"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" strokeLinecap="round" />
            </svg>
            <span>Teilen</span>
          </button>}
        </div>
      </header>

      {/* Hero Wrapped Banner mit Cover-Collage & großen Kennzahlen */}
      <section
        className="@container relative overflow-hidden rounded-3xl border border-violet-400/30 bg-gradient-to-br from-violet-950/90 via-[#121526] to-emerald-950/80 p-5 shadow-2xl sm:p-7"
        aria-label={`Jahresrückblick ${year} Übersicht`}
      >
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl" />

        <div className="relative z-10 grid grid-cols-1 items-center gap-6 @3xl:grid-cols-12">
          <div className="space-y-4 @3xl:col-span-7">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs text-white/80">
              <span>✨ Jahresrückblick {year}</span>
              <span>·</span>
              <span>
                {playtimeSource === "unbekannt" ? "Spielzeit unbekannt" : playtimeSource}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3.5 backdrop-blur-xs">
                <div className="text-[11px] font-medium tracking-wider text-violet-200/75 uppercase">
                  Spielzeit {year}
                </div>
                <div className="mt-1 text-2xl font-black tracking-tight text-white tabular-nums sm:text-3xl">
                  {playtimeSource === "unbekannt" ? "Unbekannt" : `${playtimeSource === "geschätzt (Erfolge)" ? "ca. " : ""}${formatMinutes(playtimeMin)}`}
                </div>
                <div className="mt-0.5 text-[11px] text-white/55">
                  {playtimeSource === "geschätzt (Erfolge)" ? "geschätzt aus Erfolgen" : playtimeSource}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-3.5 backdrop-blur-xs">
                <div className="text-[11px] font-medium tracking-wider text-emerald-200/75 uppercase">
                  Durchgespielt
                </div>
                <div className="mt-1 text-2xl font-black tracking-tight text-emerald-300 tabular-nums sm:text-3xl">
                  {completedGames.length}
                </div>
                <div className="mt-0.5 text-[11px] text-white/55">
                  {completedGames.length === 1 ? "Spiel abgeschlossen" : "Spiele abgeschlossen"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-3.5 backdrop-blur-xs">
                <div className="text-[11px] font-medium tracking-wider text-sky-200/75 uppercase">
                  Top-Genre
                </div>
                <div className="mt-1 truncate text-lg font-black tracking-tight text-white sm:text-xl">
                  {topGenre ? topGenre.genre : "–"}
                </div>
                <div className="mt-0.5 text-[11px] text-white/55">
                  {topGenre ? `${topGenre.source === "geschätzt (Erfolge)" ? "ca. " : ""}${formatMinutes(topGenre.playtimeMin)} · ${topGenre.gameCount} Spiele` : "Keine Daten"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-3.5 backdrop-blur-xs">
                <div className="text-[11px] font-medium tracking-wider text-amber-200/75 uppercase">
                  Neu in Sammlung
                </div>
                <div className="mt-1 text-2xl font-black tracking-tight text-amber-300 tabular-nums sm:text-3xl">
                  +{newGamesCount}
                </div>
                <div className="mt-0.5 text-[11px] text-white/55">
                  {newGamesCount === 1 ? "Neuzugang" : "Neuzugänge"} {year}
                </div>
              </div>
            </div>
          </div>

          {/* Cover-Collage */}
          <div className="@3xl:col-span-5">
            {collageGames.length > 0 ? (
              <div
                className="grid grid-cols-4 gap-2 sm:grid-cols-6 @3xl:grid-cols-4"
                aria-label="Cover-Collage deiner Spiele des Jahres"
              >
                {collageGames.slice(0, 8).map((g, idx) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGameId(g.id)}
                    title={g.title}
                    className={`group relative aspect-[3/4] overflow-hidden rounded-xl border border-white/15 bg-black/40 shadow-lg transition hover:-translate-y-1 hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                      idx >= 6 ? "hidden sm:block @3xl:block" : ""
                    }`}
                  >
                    <Cover
                      src={g.coverUrl}
                      fallbacks={g.coverFallbacks}
                      title={g.title}
                      className="h-full w-full transition duration-300 group-hover:scale-105"
                    />
                    {g.completed && (
                      <span className="absolute top-1 right-1 rounded bg-emerald-500/90 px-1 py-0.2 text-[9px] font-bold text-black">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-center text-xs text-white/50">
                Keine Spiele mit Aktivität im Jahr {year}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Wischbare Wrapped-Story-Karten (Handy: horizontal wischbar mit Snap; PC: übersichtliches Grid) */}
      <section aria-label="Jahresrückblick Highlights">
        <div className="mb-2.5 flex items-center justify-between gap-2 lg:hidden">
          <span className="text-xs font-semibold text-white/70">
            Deine Wrapped-Karten (wischen zum Blättern)
          </span>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3, 4].map((idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Karte ${idx + 1} anzeigen`}
                onClick={() => scrollToSlide(idx)}
                className={`h-2 rounded-full transition-all ${
                  activeSlide === idx ? "w-5 bg-emerald-400" : "w-2 bg-white/25"
                }`}
              />
            ))}
          </div>
        </div>

        <div
          ref={deckRef}
          onScroll={handleDeckScroll}
          className="no-scrollbar flex w-full snap-x snap-mandatory gap-3.5 overflow-x-auto pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0"
        >
          {/* Slide 1: Meistgespieltes Spiel */}
          <div className="flex min-w-[82vw] shrink-0 snap-center flex-col justify-between rounded-2xl border border-violet-400/30 bg-gradient-to-b from-violet-500/25 via-[#131726] to-[#10131e] p-4 sm:min-w-[20rem] lg:min-w-0">
            <div className="space-y-1">
              <span className="text-[11px] font-bold tracking-wider text-violet-300 uppercase">
                #1 Meistgespieltes Spiel
              </span>
              <h2 className="text-base font-bold text-white">Dein größter Zeitmagnet</h2>
            </div>

            {mostPlayedGame ? (
              <button
                type="button"
                onClick={() => setSelectedGameId(mostPlayedGame.game.id)}
                className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-2.5 text-left transition hover:border-violet-400/50"
              >
                <Cover
                  src={mostPlayedGame.game.coverUrl}
                  fallbacks={mostPlayedGame.game.coverFallbacks}
                  title={mostPlayedGame.game.title}
                  className="h-20 w-14 shrink-0 rounded-lg text-xs"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="line-clamp-2 text-sm font-bold text-white">
                    {mostPlayedGame.game.title}
                  </div>
                  <div className="text-lg font-black text-emerald-300 tabular-nums">
                    {mostPlayedGame.source === "geschätzt (Erfolge)" ? "ca. " : ""}{formatMinutes(mostPlayedGame.playtimeMin)}
                  </div>
                  <div className="text-[11px] text-white/55">
                    {mostPlayedGame.source === "geschätzt (Erfolge)" ? "geschätzt aus Erfolgen" : "gemessen"}
                  </div>
                </div>
              </button>
            ) : (
              <div className="my-6 text-xs text-white/50">Keine Spielzeit für {year} erfasst.</div>
            )}

            <div className="mt-3 text-[11px] text-white/50">
              {firstSnapshot ? `Exakte Messung seit ${new Date(firstSnapshot).toLocaleDateString("de-DE")}, sofern Vergleichswerte vorliegen; Jahresgrenzen zwischen Messungen bleiben unbekannt.` : "Noch keine Spielzeit-Snapshots vorhanden."}
              {" "}Spielzeiten ohne Jahresdaten sind nicht enthalten; die Werte können unvollständig sein.
            </div>
          </div>

          {/* Slide 2: Lieblingsgenre */}
          <div className="flex min-w-[82vw] shrink-0 snap-center flex-col justify-between rounded-2xl border border-emerald-400/30 bg-gradient-to-b from-emerald-500/20 via-[#131726] to-[#10131e] p-4 sm:min-w-[20rem] lg:min-w-0">
            <div className="space-y-1">
              <span className="text-[11px] font-bold tracking-wider text-emerald-300 uppercase">
                #2 Lieblingsgenre {year}
              </span>
              <h2 className="text-base font-bold text-white">Deine bevorzugte Welt</h2>
            </div>

            {topGenre ? (
              <div className="my-3 space-y-2">
                <div className="text-2xl font-black text-emerald-300">{topGenre.genre}</div>
                <div className="text-xs text-white/75 tabular-nums">
                  <b>{topGenre.source === "geschätzt (Erfolge)" ? "ca. " : ""}{formatMinutes(topGenre.playtimeMin)}</b> · {topGenre.source} ({topGenre.sharePercent} % Anteil) ·{" "}
                  {topGenre.gameCount} {topGenre.gameCount === 1 ? "Spiel" : "Spiele"}
                </div>
                <div className="space-y-1 pt-1">
                  {genres.slice(1, 4).map((g, i) => (
                    <div key={g.genre} className="flex items-center justify-between text-xs text-white/60">
                      <span className="truncate">
                        {i + 2}. {g.genre}
                      </span>
                      <span className="tabular-nums">{g.source === "geschätzt (Erfolge)" ? "ca. " : ""}{formatMinutes(g.playtimeMin)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="my-6 text-xs text-white/50">Keine Genre-Daten für {year}.</div>
            )}

            <div className="text-[11px] text-white/50">
              {genres.length} verschiedene Genres gespielt
            </div>
          </div>

          {/* Slide 3: Lieblingsplattform */}
          <div className="flex min-w-[82vw] shrink-0 snap-center flex-col justify-between rounded-2xl border border-sky-400/30 bg-gradient-to-b from-sky-500/20 via-[#131726] to-[#10131e] p-4 sm:min-w-[20rem] lg:min-w-0">
            <div className="space-y-1">
              <span className="text-[11px] font-bold tracking-wider text-sky-300 uppercase">
                #3 Top-Plattform {year}
              </span>
              <h2 className="text-base font-bold text-white">Dein Hauptsystem</h2>
            </div>

            {topPlatform ? (
              <div className="my-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <PlatformPill platform={topPlatform.platform} size="md" />
                  <span className="text-xl font-black text-white">{topPlatform.label}</span>
                </div>
                <div className="text-xs text-white/75 tabular-nums">
                  <b>{topPlatform.source === "geschätzt (Erfolge)" ? "ca. " : ""}{formatMinutes(topPlatform.playtimeMin)}</b> · {topPlatform.source} ({topPlatform.sharePercent} %) ·{" "}
                  {topPlatform.gameCount} {topPlatform.gameCount === 1 ? "Spiel" : "Spiele"}
                </div>
                <div className="space-y-1 pt-1">
                  {platforms.slice(1, 4).map((p, i) => (
                    <div key={p.platform} className="flex items-center justify-between text-xs text-white/60">
                      <span className="truncate">
                        {i + 2}. {p.label}
                      </span>
                      <span className="tabular-nums">{p.source === "geschätzt (Erfolge)" ? "ca. " : ""}{formatMinutes(p.playtimeMin)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="my-6 text-xs text-white/50">Keine Plattform-Daten für {year}.</div>
            )}

            <div className="text-[11px] text-white/50">
              Aktiv auf {platforms.length} {platforms.length === 1 ? "Plattform" : "Plattformen"}
            </div>
          </div>

          {/* Slide 4: Längstes & kürzestes durchgespieltes Spiel */}
          <div className="flex min-w-[82vw] shrink-0 snap-center flex-col justify-between rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-500/20 via-[#131726] to-[#10131e] p-4 sm:min-w-[20rem] lg:min-w-0">
            <div className="space-y-1">
              <span className="text-[11px] font-bold tracking-wider text-amber-300 uppercase">
                #4 Marathon & Sprint
              </span>
              <h2 className="text-base font-bold text-white">Längstes & kürzestes Finale</h2>
            </div>

            {longestCompleted ? (
              <div className="my-3 space-y-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedGameId(longestCompleted.game.id)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 p-2 text-left transition hover:border-amber-400/50"
                >
                  <Cover
                    src={longestCompleted.game.coverUrl}
                    fallbacks={longestCompleted.game.coverFallbacks}
                    title={longestCompleted.game.title}
                    className="h-11 w-8 shrink-0 rounded text-[9px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold text-amber-300 uppercase">Längstes Spiel</div>
                    <div className="truncate font-bold text-white">{longestCompleted.game.title}</div>
                    <div className="text-white/65 tabular-nums">{formatMinutes(longestCompleted.durationMin)}</div>
                  </div>
                </button>

                {shortestCompleted && shortestCompleted.game.id !== longestCompleted.game.id && (
                  <button
                    type="button"
                    onClick={() => setSelectedGameId(shortestCompleted.game.id)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 p-2 text-left transition hover:border-emerald-400/50"
                  >
                    <Cover
                      src={shortestCompleted.game.coverUrl}
                      fallbacks={shortestCompleted.game.coverFallbacks}
                      title={shortestCompleted.game.title}
                      className="h-11 w-8 shrink-0 rounded text-[9px]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold text-emerald-300 uppercase">Kürzestes Spiel</div>
                      <div className="truncate font-bold text-white">{shortestCompleted.game.title}</div>
                      <div className="text-white/65 tabular-nums">{formatMinutes(shortestCompleted.durationMin)}</div>
                    </div>
                  </button>
                )}
              </div>
            ) : (
              <div className="my-6 text-xs text-white/50">
                Noch kein Spiel im Jahr {year} als durchgespielt markiert.
              </div>
            )}

            <div className="text-[11px] text-white/50">
              {completedGames.length} {completedGames.length === 1 ? "Spiel" : "Spiele"} {year} beendet
            </div>
          </div>

          {/* Slide 5: Neuzugänge */}
          <div className="flex min-w-[82vw] shrink-0 snap-center flex-col justify-between rounded-2xl border border-pink-400/30 bg-gradient-to-b from-pink-500/20 via-[#131726] to-[#10131e] p-4 sm:min-w-[20rem] lg:min-w-0">
            <div className="space-y-1">
              <span className="text-[11px] font-bold tracking-wider text-pink-300 uppercase">
                #5 Sammlungs-Wachstum
              </span>
              <h2 className="text-base font-bold text-white">Neu hinzugekommen</h2>
            </div>

            <div className="my-3 space-y-2">
              <div className="text-3xl font-black text-pink-300 tabular-nums">+{newGamesCount}</div>
              <div className="text-xs text-white/70">
                {newGamesCount === 1
                  ? `Spiel wurde ${year} neu zur Bibliothek hinzugefügt`
                  : `Spiele wurden ${year} neu zur Bibliothek hinzugefügt`}
              </div>
              {newGames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {newGames.slice(0, 4).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedGameId(g.id)}
                      title={g.title}
                      className="overflow-hidden rounded-md border border-white/15"
                    >
                      <Cover
                        src={g.coverUrl}
                        fallbacks={g.coverFallbacks}
                        title={g.title}
                        className="h-10 w-7 text-[8px]"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="text-[11px] text-white/50">
              Sammlung gesamt: {payload.games.length} Spiele
            </div>
          </div>
        </div>
      </section>

      {/* Durchgespielte Spiele des Jahres (mit Cover und Datum) */}
      <section className="@container card p-4 sm:p-5" aria-labelledby="year-completed-title">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="year-completed-title" className="text-base font-bold sm:text-lg">
              Durchgespielte Spiele {year}
            </h2>
            <p className="text-xs text-white/55">
              Alle im Jahr {year} abgeschlossenen Titel mit Cover, Abschlussdatum und Spielzeit
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 tabular-nums">
            {completedGames.length} durchgespielt
          </span>
        </div>

        {completedGames.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.015] p-6 text-center text-sm text-white/55">
            Im Jahr {year} wurden noch keine Spiele als „Durchgespielt“ markiert. Hake abgeschlossene Spiele auf der
            Bibliotheks- oder Detailseite ab, damit sie hier mit Datum und Cover erscheinen.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
            {completedGames.map((item) => {
              const { game, completedDateLabel, playtimeMin: gPlay, durationMin } = item;
              const isLongest = longestCompleted?.game.id === game.id && completedGames.length > 1;
              const isShortest =
                shortestCompleted?.game.id === game.id &&
                completedGames.length > 1 &&
                shortestCompleted.game.id !== longestCompleted?.game.id;
              const plats = platformsOf(game);

              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => setSelectedGameId(game.id)}
                  className="group flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-emerald-400/50 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
                >
                  <Cover
                    src={game.coverUrl}
                    fallbacks={game.coverFallbacks}
                    title={game.title}
                    className="h-20 w-14 shrink-0 rounded-lg text-xs shadow-md"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 tabular-nums">
                        ✓ {completedDateLabel}{item.completionDateUnknown ? " · Datum unbekannt (Abhakdatum)" : ""}
                      </span>
                      {isLongest && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                          Längstes Spiel
                        </span>
                      )}
                      {isShortest && (
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                          Kürzestes Spiel
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm font-bold text-white group-hover:text-emerald-200">
                      {game.title}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
                      <span className="tabular-nums">
                        {gPlay > 0 ? `${formatMinutes(gPlay)} gespielt` : `Hauptstory: ${formatMinutes(durationMin)}`}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {plats.slice(0, 2).map((p) => (
                          <PlatformPill key={p} platform={p} />
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Monatsverlauf + Genre/Plattform-Verteilung */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Monatsverlauf im Jahr */}
        <section className="@container card flex flex-col justify-between p-4 sm:p-5" aria-labelledby="year-months-title">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <div>
              <h2 id="year-months-title" className="text-base font-bold sm:text-lg">
                Monatsverlauf {year}
              </h2>
              <p className="text-xs text-white/55">
                Aktive und durchgespielte Spiele von Januar bis Dezember {year}
              </p>
            </div>
            <span className="text-xs text-white/50 tabular-nums">{activeGamesCount} aktiv</span>
          </div>

          <div className="flex flex-1 flex-col justify-end pt-2">
            <svg viewBox="0 0 360 150" className="h-40 w-full overflow-visible" aria-hidden="true">
              <defs>
                <linearGradient id="nq-year-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <line x1="0" y1="22" x2="360" y2="22" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
              <line x1="0" y1="72" x2="360" y2="72" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
              <line x1="0" y1="122" x2="360" y2="122" stroke="rgba(255,255,255,0.15)" />

              {byMonth.map((m, idx) => {
                const slotW = 360 / 12;
                const barW = 18;
                const x = idx * slotW + (slotW - barW) / 2;
                const val = Math.max(m.activeCount, m.completedCount);
                const maxH = 96;
                const barH = val > 0 ? Math.max(6, Math.round((val / maxMonthActivity) * maxH)) : 2;
                const y = 122 - barH;
                return (
                  <g key={m.monthIndex}>
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx="4"
                      fill={val > 0 ? "url(#nq-year-bar)" : "rgba(255,255,255,0.12)"}
                    >
                      <title>{`${m.fullLabel}: ${m.activeCount} aktiv, ${m.completedCount} durchgespielt`}</title>
                    </rect>
                    {val > 0 && (
                      <text
                        x={x + barW / 2}
                        y={y - 5}
                        textAnchor="middle"
                        className="fill-white/85 text-[9px] font-semibold"
                      >
                        {val}
                      </text>
                    )}
                    <text x={x + barW / 2} y={138} textAnchor="middle" className="fill-white/55 text-[9px]">
                      {m.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        {/* Genres & Plattformen des Jahres */}
        <section className="@container card space-y-4 p-4 sm:p-5" aria-labelledby="year-breakdown-title">
          <div>
            <h2 id="year-breakdown-title" className="text-base font-bold sm:text-lg">
              Genres & Plattformen {year}
            </h2>
            <p className="text-xs text-white/55">
              Verteilung nach Jahres-Spielzeit {year}
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-white/60 uppercase">Top-Genres</div>
            {genres.length === 0 ? (
              <div className="text-xs text-white/45">Keine Genre-Daten für {year}.</div>
            ) : (
              genres.slice(0, 4).map((g) => {
                const widthPct = g.playtimeMin > 0 ? Math.max(4, Math.round((g.playtimeMin / maxGenrePlaytime) * 100)) : 4;
                return (
                  <div key={g.genre} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-white">{g.genre}</span>
                      <span className="text-white/65 tabular-nums">
                        {g.source === "geschätzt (Erfolge)" ? "ca. " : ""}{formatMinutes(g.playtimeMin)} · {g.gameCount} {g.gameCount === 1 ? "Spiel" : "Spiele"}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="text-xs font-semibold text-white/60 uppercase">Plattformen</div>
            {platforms.length === 0 ? (
              <div className="text-xs text-white/45">Keine Plattform-Daten für {year}.</div>
            ) : (
              platforms.slice(0, 4).map((p) => {
                const widthPct =
                  p.playtimeMin > 0 ? Math.max(4, Math.round((p.playtimeMin / maxPlatformPlaytime) * 100)) : 4;
                return (
                  <div key={p.platform} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <PlatformPill platform={p.platform} />
                        <span className="text-white/60 tabular-nums">
                          {p.gameCount} {p.gameCount === 1 ? "Spiel" : "Spiele"}
                        </span>
                      </div>
                      <span className="font-semibold text-white tabular-nums">
                        {p.source === "geschätzt (Erfolge)" ? "ca. " : ""}{formatMinutes(p.playtimeMin)} ({p.sharePercent} %)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${widthPct}%`, backgroundColor: p.color }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        wide
        title={`Jahresrückblick ${year} teilen`}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-white/55">
              Ohne persönliche Kontodaten · nur Spiele, Zahlen & NextQuest-Branding
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={sharingBusy}
                onClick={() => downloadSharePng(shareFormat)}
                className="btn-ghost text-xs sm:text-sm"
              >
                ⬇ PNG herunterladen
              </button>
              <button
                type="button"
                disabled={sharingBusy}
                onClick={() => triggerShareOrDownload(shareFormat)}
                className="btn-primary text-xs sm:text-sm"
              >
                {sharingBusy ? "Erzeuge Bild…" : "📲 Teilen (WhatsApp / Apps)"}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-white/65 sm:text-sm">
              Wähle das Bildformat für WhatsApp-Status, Story oder Chat:
            </div>
            <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-xs">
              <button
                type="button"
                onClick={() => setShareFormat("story")}
                aria-pressed={shareFormat === "story"}
                className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                  shareFormat === "story" ? "bg-violet-500 text-white" : "text-white/65 hover:text-white"
                }`}
              >
                Story 9:16 (1080×1920)
              </button>
              <button
                type="button"
                onClick={() => setShareFormat("square")}
                aria-pressed={shareFormat === "square"}
                className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                  shareFormat === "square" ? "bg-violet-500 text-white" : "text-white/65 hover:text-white"
                }`}
              >
                Quadrat 1:1 (1080×1080)
              </button>
            </div>
          </div>

          {shareStatus && <Notice kind="info">{shareStatus}</Notice>}

          <div className="flex justify-center rounded-2xl border border-white/10 bg-black/40 p-3 sm:p-4">
            <img
              key={shareImageUrl}
              src={shareImageUrl}
              alt={`Vorschau Jahresrückblick ${year} (${shareFormat === "story" ? "1080x1920" : "1080x1080"})`}
              className={`w-auto rounded-xl border border-white/15 shadow-2xl ${
                shareFormat === "story" ? "max-h-[60dvh] aspect-[9/16]" : "max-h-[54dvh] aspect-square"
              }`}
            />
          </div>
        </div>
      </Modal>

      <GameDetail
        key={selectedGameId ?? 0}
        game={selectedGame}
        igdb={payload.igdb}
        onClose={() => setSelectedGameId(null)}
        onChanged={load}
      />
    </div>
  );
}

function YearReviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-48 animate-pulse rounded-3xl bg-white/5" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}
