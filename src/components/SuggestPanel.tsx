"use client";

import { useState } from "react";
import { formatMinutes, randomPick, suggestForTime, type Suggestion } from "@/lib/suggest";
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

  const ask = (m: number, reroll = false) => {
    setMinutes(m);
    setRandom(null);
    setResults(suggestForTime(games, m, includeGamePass, reroll ? 25 : 4));
    setRolls((r) => (reroll ? r + 1 : 0));
  };

  const roll = () => {
    setResults(null);
    setMinutes(null);
    setRandom(randomPick(games, includeGamePass));
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-gradient-to-r from-violet-500/15 to-emerald-500/10 p-4">
        <div className="mr-2">
          <div className="font-semibold">Was spiele ich jetzt?</div>
          <div className="text-xs text-white/50">Wie viel Zeit hast du gerade?</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((m) => (
            <button key={m} className={`chip ${minutes === m ? "chip-on" : ""}`} onClick={() => ask(m)}>
              {m < 60 ? `${m} Min` : `${m / 60} Std`}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const m = Number(custom);
            if (m > 0) ask(m);
          }}
        >
          <input
            className="input w-24 py-1.5"
            inputMode="numeric"
            placeholder="Minuten"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
          />
          <button className="btn-ghost py-1.5">Los</button>
        </form>
        <div className="ml-auto">
          <button className="btn-primary" onClick={roll}>
            🎲 Zufallsspiel
          </button>
        </div>
      </div>

      {random && (
        <div className="p-4">
          <SuggestionRow game={random} reasons={["Zufällig aus deinen offenen Spielen"]} onOpen={onOpen} big />
          <div className="mt-3 flex gap-2">
            <button className="btn-ghost" onClick={roll}>
              🎲 Nochmal würfeln
            </button>
          </div>
        </div>
      )}

      {results && minutes && (
        <div className="space-y-2 p-4">
          {results.length === 0 ? (
            <div className="text-sm text-white/60">Keine offenen Spiele gefunden. Füge Spiele hinzu oder lade die Demo.</div>
          ) : (
            <>
              <div className="text-sm text-white/60">
                Vorschläge für <b className="text-white">{formatMinutes(minutes)}</b>
                {rolls > 0 && <span className="text-white/40"> · neu gemischt</span>}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {results.map((s) => (
                  <SuggestionRow key={s.game.id} game={s.game} reasons={s.reasons} onOpen={onOpen} />
                ))}
              </div>
              <button className="btn-ghost mt-1" onClick={() => ask(minutes, true)}>
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
      onClick={() => onOpen(game)}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2 text-left transition hover:border-violet-400/50"
    >
      <Cover
        src={game.coverUrl}
        title={game.title}
        className={`${big ? "h-28 w-20" : "h-20 w-14"} shrink-0 rounded-lg text-base`}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className={`truncate font-semibold ${big ? "text-lg" : ""}`}>{game.title}</div>
        <div className="flex flex-wrap gap-1">
          {platformsOf(game).map((p) => (
            <PlatformPill key={p} platform={p} />
          ))}
        </div>
        <ul className="text-xs text-white/60">
          {reasons.slice(0, 2).map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      </div>
    </button>
  );
}
