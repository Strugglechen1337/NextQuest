"use client";

import { useState } from "react";
import { formatMinutes, randomPick, rerollForTime, suggestForTime, type Suggestion } from "@/lib/suggest";
import type { Game } from "@/lib/types";
import { platformsOf } from "./GameCard";
import { Cover, PlatformPill } from "./ui";

const QUICK = [15, 30, 60, 90, 120, 180];

export function SuggestPanel({
  games,
  includeGamePass,
  onOpen,
}: {
  games: Game[];
  includeGamePass: boolean;
  onOpen: (g: Game) => void;
}) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [results, setResults] = useState<Suggestion[] | null>(null);
  const [random, setRandom] = useState<Game | null>(null);
  const [rolls, setRolls] = useState(0);
  // Bereits gezeigte Vorschläge – „Andere Vorschläge“ zeigt bevorzugt neue Spiele
  const [shown, setShown] = useState<Set<number>>(new Set());

  const ask = (m: number, reroll = false) => {
    setMinutes(m);
    setRandom(null);
    if (!reroll) {
      const items = suggestForTime(games, m, includeGamePass, 4);
      setResults(items);
      setShown(new Set(items.map((s) => s.game.id)));
      setRolls(0);
      return;
    }
    const { items, reset } = rerollForTime(games, m, includeGamePass, shown);
    setResults(items);
    setShown((prev) => new Set([...(reset ? [] : prev), ...items.map((s) => s.game.id)]));
    setRolls((r) => (reset ? 0 : r + 1));
  };

  const roll = () => {
    setResults(null);
    setMinutes(null);
    setRandom((prev) => randomPick(games, includeGamePass, prev?.id));
  };

  return (
    <section className="@container card min-w-0 max-w-full overflow-hidden">
      <div className="flex min-w-0 flex-col gap-3 border-b border-white/10 bg-gradient-to-r from-violet-500/15 to-emerald-500/10 p-3.5 @3xl:flex-row @3xl:flex-wrap @3xl:items-center @3xl:p-4">
        <div className="mr-2 min-w-0 shrink-0">
          <div className="text-[clamp(0.95rem,1.2vw,1.05rem)] font-semibold">Was spiele ich jetzt?</div>
          <div className="text-xs text-white/55">Wie viel Zeit hast du gerade?</div>
        </div>

        <div className="no-scrollbar flex w-full min-w-0 max-w-full items-center gap-1.5 overflow-x-auto py-0.5 @3xl:w-auto @3xl:flex-wrap">
          {QUICK.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip shrink-0 whitespace-nowrap ${minutes === m ? "chip-on" : ""}`}
              onClick={() => ask(m)}
            >
              {m < 60 ? `${m} Min` : `${m / 60} Std`}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 @sm:flex-row @sm:items-center @3xl:ml-auto">
          <form
            className="flex items-center gap-1.5 @sm:flex-1 @3xl:flex-initial"
            onSubmit={(e) => {
              e.preventDefault();
              const m = Number(custom);
              if (m > 0) ask(m);
            }}
          >
            <input
              className="input min-w-0 flex-1 py-1.5 @sm:w-28 @sm:flex-initial"
              inputMode="numeric"
              aria-label="Zeit in Minuten eingeben"
              placeholder="Minuten"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
            />
            <button type="submit" className="btn-ghost shrink-0 py-1.5">
              Los
            </button>
          </form>

          <button type="button" className="btn-primary w-full shrink-0 @sm:w-auto" onClick={roll}>
            🎲 Zufallsspiel
          </button>
        </div>
      </div>

      {random && (
        <div className="p-3.5 @3xl:p-4">
          <SuggestionRow game={random} reasons={["Zufällig aus deinen offenen Spielen"]} onOpen={onOpen} big />
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-ghost w-full @sm:w-auto" onClick={roll}>
              🎲 Nochmal würfeln
            </button>
          </div>
        </div>
      )}

      {results && minutes && (
        <div className="space-y-2.5 p-3.5 @3xl:p-4">
          {results.length === 0 ? (
            <div className="text-sm text-white/60">
              Keine offenen Spiele gefunden. Füge Spiele hinzu oder lade die Demo.
            </div>
          ) : (
            <>
              <div className="text-sm text-white/65">
                Vorschläge für <b className="text-white">{formatMinutes(minutes)}</b>
                {rolls > 0 && <span className="text-white/45"> · neu gemischt</span>}
              </div>
              <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-2">
                {results.map((s) => (
                  <SuggestionRow key={s.game.id} game={s.game} reasons={s.reasons} onOpen={onOpen} />
                ))}
              </div>
              <button type="button" className="btn-ghost mt-1 w-full @sm:w-auto" onClick={() => ask(minutes, true)}>
                ↻ Andere Vorschläge
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function SuggestionRow({
  game,
  reasons,
  onOpen,
  big,
}: {
  game: Game;
  reasons: string[];
  onOpen: (g: Game) => void;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(game)}
      className="@container flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-left transition hover:border-violet-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
    >
      <Cover
        src={game.coverUrl}
        title={game.title}
        className={`${big ? "h-24 w-16 @sm:h-28 @sm:w-20" : "h-20 w-14"} shrink-0 rounded-lg text-base`}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className={`truncate font-semibold ${big ? "text-base @sm:text-lg" : "text-sm @sm:text-base"}`}>
          {game.title}
        </div>
        <div className="flex flex-wrap gap-1">
          {platformsOf(game).map((p) => (
            <PlatformPill key={p} platform={p} />
          ))}
        </div>
        <ul className="space-y-0.5 text-xs text-white/65">
          {reasons.slice(0, 2).map((r) => (
            <li key={r} className="truncate">
              • {r}
            </li>
          ))}
        </ul>
      </div>
    </button>
  );
}
