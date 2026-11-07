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
  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className={`block w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition hover:-translate-y-0.5 hover:border-violet-400/50 hover:shadow-lg hover:shadow-violet-500/10 ${
          game.completed ? "opacity-55" : ""
        }`}
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-white/5">
          <Cover src={game.coverUrl} title={game.title} className="h-full w-full" />
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
        <div className="space-y-1.5 p-2.5">
          <div className="line-clamp-2 min-h-[2.5em] text-sm font-medium leading-tight">{game.title}</div>
          <div className="flex flex-wrap gap-1">
            {platformsOf(game).map((p) => (
              <PlatformPill key={p} platform={p} />
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-white/50">
            <span title="Deine Spielzeit">🎮 {game.playtimeMin ? formatMinutes(game.playtimeMin) : "neu"}</span>
            <span title="Spieldauer (Hauptstory)">⏱ {formatMinutes(game.ttbNormally)}</span>
          </div>
        </div>
      </button>
      <button
        onClick={onToggleCompleted}
        title={game.completed ? "Als offen markieren" : "Als durchgespielt abhaken"}
        className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border text-sm shadow transition ${
          game.completed
            ? "border-emerald-300 bg-emerald-500 text-black"
            : "border-white/30 bg-black/60 text-white/80 opacity-0 hover:bg-emerald-500 hover:text-black group-hover:opacity-100 focus:opacity-100"
        }`}
      >
        ✓
      </button>
    </div>
  );
}
