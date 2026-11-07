"use client";

import Link from "next/link";
import { useMemo } from "react";
import { evaluateAllGoals, parseGoals, type GoalProgress } from "@/lib/goals";
import type { Game } from "@/lib/types";
import { Cover } from "./ui";

export function GoalsHomeBanner({
  goalsRaw,
  games,
  onOpenGame,
}: {
  goalsRaw: string | null | undefined;
  games: readonly Game[];
  onOpenGame?: (game: Game) => void;
}) {
  const goals = useMemo(() => parseGoals(goalsRaw), [goalsRaw]);
  const evaluated = useMemo(() => evaluateAllGoals(goals, games), [goals, games]);

  if (goals.length === 0) return null;

  const displayItems: GoalProgress[] =
    evaluated.active.length > 0 ? evaluated.active.slice(0, 4) : evaluated.history.slice(0, 3);
  const achievedCount = evaluated.history.filter((h) => h.status === "achieved").length;

  return (
    <section
      className="@container card w-full min-w-0 max-w-full overflow-hidden border-violet-400/20 bg-gradient-to-r from-violet-500/10 via-white/[0.02] to-emerald-500/10 p-3 sm:p-3.5"
      aria-label="Deine Spielziele"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-500/25 text-xs font-bold text-violet-200">
            🎯
          </span>
          <h2 className="text-xs font-semibold tracking-tight sm:text-sm">Spielziele</h2>
          {evaluated.active.length > 0 && (
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-200 tabular-nums">
              {evaluated.active.length} aktiv
            </span>
          )}
          {achievedCount > 0 && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300 tabular-nums">
              ✓ {achievedCount} geschafft
            </span>
          )}
        </div>
        <Link
          href="/stats#ziele"
          className="text-xs font-medium text-violet-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
        >
          Ziele verwalten →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-3">
        {displayItems.map((item) => {
          const { goal, percent, status, progressLabel, subLabel, targetGame } = item;
          const barColor =
            status === "achieved"
              ? "from-emerald-400 to-emerald-300"
              : status === "failed"
                ? "from-rose-500 to-amber-500"
                : "from-violet-500 to-emerald-400";

          return (
            <div
              key={goal.id}
              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/25 px-3 py-2"
            >
              {targetGame && (
                <button
                  type="button"
                  onClick={() => onOpenGame?.(targetGame)}
                  title={targetGame.title}
                  className="shrink-0 overflow-hidden rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
                >
                  <Cover
                    src={targetGame.coverUrl}
                    fallbacks={targetGame.coverFallbacks}
                    title={targetGame.title}
                    className="h-10 w-7 rounded text-[9px]"
                  />
                </button>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-white/90" title={goal.title}>
                    {goal.title}
                  </span>
                  {status === "achieved" ? (
                    <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                      ✓ geschafft
                    </span>
                  ) : status === "failed" ? (
                    <span className="shrink-0 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                      ✗ verpasst
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] font-bold text-emerald-300 tabular-nums">
                      {percent} %
                    </span>
                  )}
                </div>

                <div
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${goal.title}: ${percent} %`}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                >
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all`}
                    style={{ width: `${Math.max(percent > 0 ? 4 : 0, percent)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-white/55">
                  <span className="truncate">{progressLabel}</span>
                  <span className="shrink-0 tabular-nums">{subLabel.split("·")[0]?.trim()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
