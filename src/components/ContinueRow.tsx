"use client";

import { useMemo, useRef } from "react";
import { formatLastPlayedDays, getContinueGames, getStoryProgressPercent } from "@/lib/stats";
import { formatMinutes } from "@/lib/suggest";
import type { Game } from "@/lib/types";
import { platformsOf } from "./GameCard";
import { Cover, PlatformPill } from "./ui";

export function ContinueRow({
  games,
  onOpen,
}: {
  games: readonly Game[];
  onOpen: (game: Game) => void;
}) {
  const items = useMemo(() => getContinueGames(games, 12), [games]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  if (items.length === 0) return null;

  const scrollByCards = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, Math.round(el.clientWidth * 0.75)), behavior: "smooth" });
  };

  return (
    <section className="@container card w-full min-w-0 max-w-full overflow-hidden p-3.5 @3xl:p-4" aria-label="Weiterspielen">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[clamp(0.95rem,1.2vw,1.05rem)] font-semibold">Weiterspielen</h2>
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-200 tabular-nums">
              {items.length}
            </span>
          </div>
          <p className="text-xs text-white/55">Zuletzt gespielte, noch offene Spiele deiner Sammlung</p>
        </div>

        {items.length > 4 && (
          <div className="hidden items-center gap-1.5 sm:flex">
            <button
              type="button"
              onClick={() => scrollByCards(-1)}
              aria-label="Nach links blättern"
              className=" inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/75 transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => scrollByCards(1)}
              aria-label="Nach rechts blättern"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/75 transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div
        ref={scrollerRef}
        className="no-scrollbar flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 sm:gap-3"
      >
        {items.map((game) => {
          const lastPlayedLabel = formatLastPlayedDays(game.lastPlayed);
          const progress = getStoryProgressPercent(game);
          const platforms = platformsOf(game);

          return (
            <button
              key={game.id}
              type="button"
              onClick={() => onOpen(game)}
              className="group flex w-[clamp(8.5rem,12.2vw,10.5rem)] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition hover:-translate-y-0.5 hover:border-violet-400/50 hover:shadow-lg hover:shadow-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-white/5">
                <Cover
                  src={game.coverUrl}
                  fallbacks={game.coverFallbacks}
                  title={game.title}
                  className="h-full w-full"
                />
                {platforms.length > 0 && (
                  <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
                    {platforms.slice(0, 2).map((p) => (
                      <PlatformPill key={p} platform={p} />
                    ))}
                  </div>
                )}
                {game.playtimeMin > 0 && (
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-xs tabular-nums">
                    {formatMinutes(game.playtimeMin)}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col justify-between gap-1.5 p-2 sm:p-2.5">
                <div className="space-y-1">
                  <div className="line-clamp-2 min-h-[2.4em] text-xs font-medium leading-tight break-words sm:text-[13px]">
                    {game.title}
                  </div>
                  {lastPlayedLabel && (
                    <div className="truncate text-[11px] text-white/55">{lastPlayedLabel}</div>
                  )}
                </div>

                {progress !== null && (
                  <div className="space-y-1 pt-0.5">
                    <div
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`ca. ${progress} % der Hauptstory`}
                      className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="truncate text-[10px] font-medium text-emerald-300/90 tabular-nums sm:text-[11px]">
                      ca. {progress} % der Hauptstory
                    </div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
