"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import {
  countPileOfShame,
  defaultGoalTitle,
  evaluateAllGoals,
  getPileOfShameGameIds,
  monthStartEnd,
  parseGoals,
  toDateKey,
  yearStartEnd,
  type Goal,
  type GoalKind,
  type GoalPeriod,
  type GoalProgress,
} from "@/lib/goals";
import type { Game } from "@/lib/types";
import { Cover, Notice } from "./ui";

export function GoalsSection({
  goalsRaw,
  games,
  onChanged,
  onOpenGame,
}: {
  goalsRaw: string | null | undefined;
  games: readonly Game[];
  onChanged: () => void;
  onOpenGame: (gameId: number) => void;
}) {
  const goals = useMemo(() => parseGoals(goalsRaw), [goalsRaw]);
  const evaluated = useMemo(() => evaluateAllGoals(goals, games), [goals, games]);
  const currentPileCount = useMemo(() => countPileOfShame(games), [games]);

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formular-Felder
  const [kind, setKind] = useState<GoalKind>("complete_count");
  const [period, setPeriod] = useState<GoalPeriod>("month");
  const [targetCount, setTargetCount] = useState<number>(2);
  const [startDate, setStartDate] = useState<string>(() => monthStartEnd().startDate);
  const [deadline, setDeadline] = useState<string>(() => monthStartEnd().deadline);
  const [gameId, setGameId] = useState<number>(() => {
    const firstOpen = games.find((g) => !g.completed);
    return firstOpen?.id ?? games[0]?.id ?? 0;
  });
  const [baselinePileCount, setBaselinePileCount] = useState<number>(currentPileCount);
  const [title, setTitle] = useState<string>("");

  const sortedCandidateGames = useMemo(() => {
    return [...games].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.title.localeCompare(b.title, "de");
    });
  }, [games]);

  const selectedFormGame = useMemo(
    () => games.find((g) => g.id === gameId) ?? null,
    [games, gameId],
  );

  const previewTitle = useMemo(
    () =>
      defaultGoalTitle({
        kind,
        targetCount: kind === "complete_game" ? 1 : targetCount,
        period: kind === "complete_count" ? period : undefined,
        deadline,
        gameTitle: selectedFormGame?.title ?? null,
      }),
    [kind, targetCount, period, deadline, selectedFormGame],
  );

  const openNewGoalForm = (preset?: {
    kind: GoalKind;
    period?: GoalPeriod;
    targetCount?: number;
  }) => {
    setError(null);
    setEditingGoalId(null);
    const nextKind = preset?.kind ?? "complete_count";
    const nextPeriod = preset?.period ?? "month";
    setKind(nextKind);
    setPeriod(nextPeriod);

    if (nextKind === "complete_count") {
      const range = nextPeriod === "year" ? yearStartEnd() : monthStartEnd();
      setStartDate(range.startDate);
      setDeadline(range.deadline);
      setTargetCount(preset?.targetCount ?? (nextPeriod === "year" ? 12 : 2));
    } else if (nextKind === "reduce_pile") {
      const range = yearStartEnd();
      setStartDate(toDateKey(new Date().toISOString())!);
      setDeadline(range.deadline);
      setTargetCount(preset?.targetCount ?? Math.max(1, Math.min(3, currentPileCount || 3)));
      setBaselinePileCount(currentPileCount);
    } else {
      const range = yearStartEnd();
      setStartDate(toDateKey(new Date().toISOString())!);
      setDeadline(range.deadline);
      setTargetCount(1);
      const firstOpen = sortedCandidateGames[0];
      if (firstOpen) setGameId(firstOpen.id);
    }
    setTitle("");
    setFormOpen(true);
  };

  const openEditGoalForm = (goal: Goal) => {
    setError(null);
    setEditingGoalId(goal.id);
    setKind(goal.kind);
    setPeriod(goal.period ?? "custom");
    setTargetCount(goal.targetCount);
    setStartDate(goal.startDate);
    setDeadline(goal.deadline);
    if (goal.gameId) setGameId(goal.gameId);
    setBaselinePileCount(goal.baselinePileCount ?? currentPileCount);
    setTitle(goal.title);
    setFormOpen(true);
  };

  const handlePeriodChange = (nextPeriod: GoalPeriod) => {
    setPeriod(nextPeriod);
    if (nextPeriod === "month") {
      const r = monthStartEnd();
      setStartDate(r.startDate);
      setDeadline(r.deadline);
      if (targetCount === 12) setTargetCount(2);
    } else if (nextPeriod === "year") {
      const r = yearStartEnd();
      setStartDate(r.startDate);
      setDeadline(r.deadline);
      if (targetCount === 2) setTargetCount(12);
    }
  };

  const handleKindChange = (nextKind: GoalKind) => {
    setKind(nextKind);
    if (nextKind === "complete_count") {
      const r = period === "year" ? yearStartEnd() : monthStartEnd();
      setStartDate(r.startDate);
      setDeadline(r.deadline);
      setTargetCount(period === "year" ? 12 : 2);
    } else if (nextKind === "reduce_pile") {
      setStartDate(toDateKey(new Date().toISOString())!);
      setDeadline(yearStartEnd().deadline);
      setBaselinePileCount(currentPileCount);
      setTargetCount(Math.max(1, Math.min(3, currentPileCount || 3)));
    } else {
      setStartDate(toDateKey(new Date().toISOString())!);
      setDeadline(yearStartEnd().deadline);
      setTargetCount(1);
      if (!gameId && sortedCandidateGames[0]) {
        setGameId(sortedCandidateGames[0].id);
      }
    }
  };

  const saveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const existing = editingGoalId ? goals.find((g) => g.id === editingGoalId) : null;
      const payload: Partial<Goal> = {
        id: editingGoalId ?? undefined,
        kind,
        title: title.trim() || previewTitle,
        targetCount: kind === "complete_game" ? 1 : Number(targetCount),
        period: kind === "complete_count" ? period : undefined,
        startDate,
        deadline,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      if (kind === "complete_game") {
        payload.gameId = Number(gameId);
        payload.gameTitle = selectedFormGame?.title ?? existing?.gameTitle ?? null;
      }
      if (kind === "reduce_pile") {
        payload.baselinePileCount = Number(baselinePileCount);
        payload.baselinePileGameIds = existing?.baselinePileGameIds ?? getPileOfShameGameIds(games);
      }
      await api("/api/goals", { method: "POST", body: payload });
      setFormOpen(false);
      setEditingGoalId(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addQuickPreset = async (preset: {
    kind: GoalKind;
    period?: GoalPeriod;
    targetCount: number;
    game?: Game;
  }) => {
    setBusy(true);
    setError(null);
    try {
      const nowIso = new Date().toISOString();
      const todayKey = toDateKey(nowIso)!;
      const range =
        preset.kind === "complete_count" && preset.period === "month"
          ? monthStartEnd()
          : yearStartEnd();

      const payload: Partial<Goal> = {
        kind: preset.kind,
        period: preset.period,
        targetCount: preset.targetCount,
        startDate: preset.kind === "complete_count" ? range.startDate : todayKey,
        deadline: range.deadline,
        gameId: preset.game?.id ?? null,
        gameTitle: preset.game?.title ?? null,
        baselinePileCount: preset.kind === "reduce_pile" ? currentPileCount : undefined,
        baselinePileGameIds: preset.kind === "reduce_pile" ? getPileOfShameGameIds(games) : undefined,
      };
      await api("/api/goals", { method: "POST", body: payload });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deleteGoal = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/goals?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (editingGoalId === id) {
        setFormOpen(false);
        setEditingGoalId(null);
      }
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const firstOpenGame = sortedCandidateGames.find((g) => !g.completed) ?? null;

  return (
    <section
      id="ziele"
      className="@container card overflow-hidden p-4 sm:p-5"
      aria-labelledby="goals-section-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="goals-section-title" className="text-base font-bold sm:text-lg">
              Ziele
            </h2>
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-semibold text-violet-200 tabular-nums">
              {evaluated.active.length} aktiv
            </span>
            {evaluated.history.length > 0 && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300 tabular-nums">
                {evaluated.history.filter((h) => h.status === "achieved").length} geschafft
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-white/55">
            Setze dir persönliche Spielziele – Fortschritt wird automatisch aus abgeschlossenen Spielen, Spielzeit und Pile of Shame berechnet
          </p>
        </div>

        <button
          type="button"
          onClick={() => (formOpen && !editingGoalId ? setFormOpen(false) : openNewGoalForm())}
          className="btn-primary text-xs sm:text-sm"
        >
          {formOpen && !editingGoalId ? "✕ Formular schließen" : "＋ Neues Ziel"}
        </button>
      </div>

      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {/* Schnellvorlagen für 1-Klick-Anlage */}
      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-white/45">Schnellziel:</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => addQuickPreset({ kind: "complete_count", period: "month", targetCount: 2 })}
          className="chip text-xs"
        >
          ＋ Diesen Monat 2 Spiele durchspielen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => addQuickPreset({ kind: "complete_count", period: "year", targetCount: 12 })}
          className="chip text-xs"
        >
          ＋ Dieses Jahr 12 Spiele durchspielen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            addQuickPreset({
              kind: "reduce_pile",
              targetCount: Math.max(1, Math.min(3, currentPileCount || 3)),
            })
          }
          className="chip text-xs"
        >
          ＋ Pile of Shame um {Math.max(1, Math.min(3, currentPileCount || 3))} verkleinern
        </button>
        {firstOpenGame && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              addQuickPreset({
                kind: "complete_game",
                targetCount: 1,
                game: firstOpenGame,
              })
            }
            className="chip text-xs"
          >
            ＋ „{firstOpenGame.title}“ bis Jahresende
          </button>
        )}
      </div>

      {/* Formular zum Anlegen / Bearbeiten */}
      {formOpen && (
        <form
          onSubmit={saveGoal}
          className="mt-4 space-y-3.5 rounded-xl border border-violet-400/30 bg-white/[0.03] p-3.5 sm:p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-violet-200">
              {editingGoalId ? "Ziel bearbeiten" : "Neues Spielziel anlegen"}
            </h3>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditingGoalId(null);
              }}
              className="text-xs text-white/55 hover:text-white"
            >
              Abbrechen
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-white/65">Art des Ziels</span>
              <select
                className="input"
                value={kind}
                onChange={(e) => handleKindChange(e.target.value as GoalKind)}
              >
                <option value="complete_count">Spiele im Zeitraum durchspielen</option>
                <option value="reduce_pile">Pile of Shame verkleinern</option>
                <option value="complete_game">Bestimmtes Spiel bis Datum durchspielen</option>
              </select>
            </label>

            {kind === "complete_count" && (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-white/65">Zeitraum</span>
                  <select
                    className="input"
                    value={period}
                    onChange={(e) => handlePeriodChange(e.target.value as GoalPeriod)}
                  >
                    <option value="month">Dieser Monat</option>
                    <option value="year">Dieses Jahr</option>
                    <option value="custom">Eigener Zeitraum</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-white/65">Anzahl Spiele</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    className="input"
                    value={targetCount}
                    onChange={(e) => setTargetCount(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
              </>
            )}

            {kind === "reduce_pile" && (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-white/65">Um wie viele Spiele senken?</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    className="input"
                    value={targetCount}
                    onChange={(e) => setTargetCount(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-white/65">
                    Ausgangswert Pile of Shame (aktuell: {currentPileCount})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    required
                    className="input"
                    value={baselinePileCount}
                    onChange={(e) => setBaselinePileCount(Math.max(0, Number(e.target.value) || 0))}
                  />
                </label>
              </>
            )}

            {kind === "complete_game" && (
              <label className="block space-y-1 @xl:col-span-2">
                <span className="text-xs font-medium text-white/65">Spiel aus der Bibliothek</span>
                <select
                  className="input"
                  value={gameId}
                  onChange={(e) => setGameId(Number(e.target.value))}
                >
                  {sortedCandidateGames.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title} {g.completed ? "(bereits durchgespielt)" : g.playtimeMin > 0 ? "(begonnen)" : "(ungespielt)"}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-white/65">Startdatum</span>
              <input
                type="date"
                required
                className="input"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (kind === "complete_count") setPeriod("custom");
                }}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-white/65">Durchspielen / Erreichen bis</span>
              <input
                type="date"
                required
                className="input"
                value={deadline}
                onChange={(e) => {
                  setDeadline(e.target.value);
                  if (kind === "complete_count") setPeriod("custom");
                }}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-white/65">Bezeichnung (optional)</span>
              <input
                type="text"
                maxLength={200}
                placeholder={previewTitle}
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              className="btn-ghost text-xs sm:text-sm"
              onClick={() => {
                setFormOpen(false);
                setEditingGoalId(null);
              }}
            >
              Abbrechen
            </button>
            <button type="submit" disabled={busy} className="btn-primary text-xs sm:text-sm">
              {editingGoalId ? "Änderungen speichern" : "Ziel speichern"}
            </button>
          </div>
        </form>
      )}

      {/* Aktive Ziele */}
      {evaluated.all.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.015] p-6 text-center text-sm text-white/55">
          Noch keine Ziele angelegt. Wähle oben ein Schnellziel oder klicke auf „＋ Neues Ziel“.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {evaluated.active.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
                Aktive Ziele ({evaluated.active.length})
              </h3>
              <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
                {evaluated.active.map((item) => (
                  <GoalCard
                    key={item.goal.id}
                    item={item}
                    busy={busy}
                    onEdit={() => openEditGoalForm(item.goal)}
                    onDelete={() => deleteGoal(item.goal.id)}
                    onOpenGame={onOpenGame}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Historie abgeschlossener / abgelaufener Ziele */}
          {evaluated.history.length > 0 && (
            <div className="space-y-2.5 border-t border-white/10 pt-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Historie – Abgeschlossene & abgelaufene Ziele ({evaluated.history.length})
                </h3>
                <span className="text-xs text-white/45 tabular-nums">
                  {evaluated.history.filter((h) => h.status === "achieved").length} ✓ geschafft ·{" "}
                  {evaluated.history.filter((h) => h.status === "failed").length} ✗ verpasst
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 @2xl:grid-cols-2">
                {evaluated.history.map((item) => (
                  <GoalCard
                    key={item.goal.id}
                    item={item}
                    busy={busy}
                    onEdit={() => openEditGoalForm(item.goal)}
                    onDelete={() => deleteGoal(item.goal.id)}
                    onOpenGame={onOpenGame}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function GoalCard({
  item,
  busy,
  onEdit,
  onDelete,
  onOpenGame,
}: {
  item: GoalProgress;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenGame: (gameId: number) => void;
}) {
  const { goal, percent, status, resultLabel, progressLabel, subLabel, matchedGames, targetGame } = item;

  const badgeCls =
    status === "achieved"
      ? "border-emerald-400/30 bg-emerald-500/20 text-emerald-200"
      : status === "failed"
        ? "border-rose-400/30 bg-rose-500/20 text-rose-200"
        : "border-violet-400/30 bg-violet-500/20 text-violet-200";

  const barCls =
    status === "achieved"
      ? "from-emerald-400 to-teal-300"
      : status === "failed"
        ? "from-rose-500 to-amber-500"
        : "from-violet-500 to-emerald-400";

  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3.5 transition hover:border-white/20">
      <div className="flex items-start gap-3">
        {targetGame && (
          <button
            type="button"
            onClick={() => onOpenGame(targetGame.id)}
            className="shrink-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
            title={targetGame.title}
          >
            <Cover
              src={targetGame.coverUrl}
              fallbacks={targetGame.coverFallbacks}
              title={targetGame.title}
              className="h-16 w-12 rounded-lg text-xs"
            />
          </button>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-bold leading-snug break-words text-white">{goal.title}</div>
              <div className="mt-0.5 text-xs text-white/55">{subLabel}</div>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${badgeCls}`}
            >
              {status === "open" ? `${percent} %` : resultLabel}
            </span>
          </div>

          <div className="space-y-1">
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${goal.title}: ${percent} %`}
              className="h-2 w-full overflow-hidden rounded-full bg-white/10"
            >
              <div
                className={`h-full rounded-full bg-gradient-to-r ${barCls} transition-all`}
                style={{ width: `${Math.max(percent > 0 ? 4 : 0, percent)}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-white/75">
              <span>{progressLabel}</span>
              <span className="font-semibold text-white/60 tabular-nums">
                {item.current} / {item.target}
              </span>
            </div>
          </div>

          {matchedGames.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {matchedGames.slice(0, 4).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onOpenGame(g.id)}
                  className="inline-flex max-w-44 items-center gap-1 truncate rounded-md border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  <span>✓</span>
                  <span className="truncate">{g.title}</span>
                </button>
              ))}
              {matchedGames.length > 4 && (
                <span className="text-[11px] text-white/45">+{matchedGames.length - 4} weitere</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 border-t border-white/5 pt-2 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="rounded-lg px-2.5 py-1 font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Bearbeiten
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="rounded-lg px-2.5 py-1 font-medium text-red-300/80 transition hover:bg-red-500/15 hover:text-red-200"
        >
          Löschen
        </button>
      </div>
    </div>
  );
}
