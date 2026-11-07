"use client";

import { PLATFORM_ORDER } from "@/lib/platforms";
import { formatMinutes } from "@/lib/suggest";
import type { Game } from "@/lib/types";
import { Cover, PlatformPill } from "./ui";

export function platformsOf(g: Game) {
  const set = new Set(g.ownerships.map((o) => o.platform));
  return PLATFORM_ORDER.filter((p) => set.has(p));
}

export function GameCard({
  game,
  onOpen,
  onToggleCompleted,
}: {
  game: Game;
  onOpen: () => void;
  onToggleCompleted: () => void;
}) {
  const actionLabel = game.completed
    ? `${game.title} als offen markieren`
    : `${game.title} als durchgespielt abhaken`;

  return (
    <div className="@container group relative">
      <button
        type="button"
        onClick={onOpen}
        className={`block h-full w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition hover:-translate-y-0.5 hover:border-violet-400/50 hover:shadow-lg hover:shadow-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80 ${
          game.completed ? "opacity-60" : ""
        }`}
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-white/5">
          <Cover src={game.coverUrl} fallbacks={game.coverFallbacks} title={game.title} className="h-full w-full" />
          {game.copies > 1 && (
            <span
              className="absolute left-2 top-2 rounded-md bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-black shadow"
              title={`Du besitzt dieses Spiel ${game.copies}×`}
            >
              ×{game.copies}
            </span>
          )}
          {game.completed && (
            <span className="absolute inset-x-0 bottom-0 bg-emerald-500/90 py-1 text-center text-xs font-semibold text-black">
              ✓ Durchgespielt
            </span>
          )}
        </div>
        <div className="space-y-1.5 p-2 @[155px]:p-2.5">
          <div className="line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-tight break-words @[155px]:text-sm">
            {game.title}
          </div>
          <div className="flex flex-wrap gap-1">
            {platformsOf(game).map((p) => (
              <PlatformPill key={p} platform={p} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-white/55">
            <span title="Deine Spielzeit">🎮 {game.playtimeMin ? formatMinutes(game.playtimeMin) : "neu"}</span>
            <span title="Spieldauer (Hauptstory)">⏱ {formatMinutes(game.ttbNormally)}</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={onToggleCompleted}
        title={game.completed ? "Als offen markieren" : "Als durchgespielt abhaken"}
        aria-label={actionLabel}
        aria-pressed={game.completed}
        className={`absolute right-0.5 top-0.5 grid h-11 w-11 place-items-center rounded-full transition focus-visible:opacity-100 focus-visible:outline-none ${
          game.completed ? "opacity-100" : "card-check-incomplete"
        }`}
      >
        <span
          className={`grid h-7 w-7 place-items-center rounded-full border text-sm shadow transition ${
            game.completed
              ? "border-emerald-300 bg-emerald-500 text-black"
              : "border-white/35 bg-black/70 text-white/90 backdrop-blur-xs hover:bg-emerald-500 hover:text-black"
          }`}
        >
          ✓
        </span>
      </button>
    </div>
  );
}
