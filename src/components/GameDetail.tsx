"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { GameMeta } from "@/lib/library";
import { PLATFORMS } from "@/lib/platforms";
import { formatMinutes } from "@/lib/suggest";
import type { Game } from "@/lib/types";
import { IgdbPicker } from "./IgdbPicker";
import { Cover, Modal, PlatformPill } from "./ui";

export function GameDetail({
  game,
  igdb,
  onClose,
  onChanged,
}: {
  game: Game | null;
  igdb: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rematch, setRematch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!game) return null;

  const run = async (fn: () => Promise<unknown>, close = false) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      if (close) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (m: GameMeta) =>
    run(async () => {
      await api(`/api/games/${game.id}`, { method: "PATCH", body: { meta: m } });
      setRematch(false);
    }, true);

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={game.title}
      footer={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className={`${game.completed ? "btn-ghost" : "btn-primary"} flex-1 sm:flex-initial`}
            onClick={() =>
              run(() => api(`/api/games/${game.id}`, { method: "PATCH", body: { completed: !game.completed } }))
            }
          >
            {game.completed ? "↺ Wieder als offen markieren" : "✓ Als durchgespielt abhaken"}
          </button>
          {igdb && (
            <button type="button" className="btn-ghost" onClick={() => setRematch((v) => !v)}>
              Zuordnung ändern
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 @lg:flex-row @lg:gap-5">
        <div className="flex items-start gap-4 @lg:block">
          <Cover
            src={game.coverUrl}
            fallbacks={game.coverFallbacks}
            title={game.title}
            className="aspect-[3/4] w-24 shrink-0 self-start rounded-xl @sm:w-28 @lg:w-40"
          />
          <div className="min-w-0 flex-1 space-y-1.5 @lg:hidden">
            <h2 className="text-lg font-bold leading-snug break-words">{game.title}</h2>
            <div className="text-sm text-white/55">
              {game.releaseYear ?? ""}
              {game.genres.length ? ` · ${game.genres.slice(0, 4).join(", ")}` : ""}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3.5">
          <div className="hidden @lg:block">
            <h2 className="text-xl font-bold leading-snug break-words">{game.title}</h2>
            <div className="text-sm text-white/55">
              {game.releaseYear ?? ""}
              {game.genres.length ? ` · ${game.genres.slice(0, 4).join(", ")}` : ""}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm @md:grid-cols-4">
            <Stat label="Deine Spielzeit" value={formatMinutes(game.playtimeMin)} />
            <Stat label="Bewertung" value={game.rating ? `${Math.round(game.rating)}/100` : "–"} />
            <Stat
              label="Beliebtheit"
              value={game.ratingCount ? `${game.ratingCount.toLocaleString("de-DE")} Stimmen` : "–"}
            />
            <Stat label="Exemplare" value={game.copies ? `${game.copies}×` : "Game Pass"} />
          </div>

          <div className="card p-3">
            <div className="mb-1.5 text-xs uppercase tracking-wide text-white/45">Spieldauer</div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-white/55">Zügig</div>
                <div className="font-semibold">{formatMinutes(game.ttbHastily)}</div>
              </div>
              <div>
                <div className="text-white/55">Normal</div>
                <div className="font-semibold">{formatMinutes(game.ttbNormally)}</div>
              </div>
              <div>
                <div className="text-white/55">100 %</div>
                <div className="font-semibold">{formatMinutes(game.ttbCompletely)}</div>
              </div>
            </div>
          </div>

          <label className="block space-y-2 text-sm">
            <span className="text-white/65">Session-Länge</span>
            <select
              className="min-h-11 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-2 text-white"
              value={game.sessionPref ?? "auto"}
              disabled={busy}
              onChange={(e) => run(() => api(`/api/games/${game.id}`, {
                method: "PATCH", body: { sessionPref: e.target.value === "auto" ? null : e.target.value },
              }))}
            >
              <option value="auto">Automatisch</option>
              <option value="short">Kurze Runden</option>
              <option value="medium">Mittel</option>
              <option value="long">Lange Sessions</option>
            </select>
          </label>

          {(game.summaryDe || game.summary) && <p className="line-clamp-4 text-sm leading-relaxed text-white/75">{game.summaryDe || game.summary}{!game.summaryDe && <span className="text-xs text-white/45"> (englisch)</span>}</p>}
          {game.summaryDe && game.summaryDeSource?.source === "wikipedia" && <p className="text-xs text-white/45"><a href={game.summaryDeSource.url} target="_blank" rel="noreferrer" className="underline">Quelle: Wikipedia</a> ? <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer" className="underline">CC BY-SA 4.0</a> ? gek?rzt</p>}

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-white/45">Wo du es hast</div>
            <div className="divide-y divide-white/5 rounded-xl border border-white/10">
              {game.ownerships.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                  <PlatformPill platform={o.platform} size="md" />
                  <span className="min-w-0 flex-1 truncate text-white/80" title={o.title}>
                    {o.title}
                  </span>
                  <span className="text-white/55">
                    {PLATFORMS[o.platform]?.subscription ? "Abo" : formatMinutes(o.playtimeMin)}
                  </span>
                  {game.ownerships.length > 1 && (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded px-2 py-1 text-xs text-white/55 transition hover:bg-white/10 hover:text-white"
                      title="Falsch zugeordnet? Als eigenes Spiel abtrennen"
                      onClick={() => run(() => api(`/api/ownerships/${o.id}`, { body: {} }), true)}
                    >
                      abtrennen
                    </button>
                  )}
                  {o.source !== "sync" && (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded px-2 py-1 text-xs text-red-300/80 transition hover:bg-red-500/10 hover:text-red-300"
                      onClick={() =>
                        confirm(`„${o.title}“ (${PLATFORMS[o.platform]?.label}) entfernen?`) &&
                        run(() => api(`/api/ownerships/${o.id}`, { method: "DELETE" }), game.ownerships.length === 1)
                      }
                    >
                      entfernen
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <div className="text-sm text-red-300">{error}</div>}

          {rematch && (
            <div className="card space-y-2 p-3">
              <div className="text-sm text-white/65">
                Wähle das richtige Spiel aus. Gibt es das Spiel schon in deiner Sammlung, werden die Einträge
                zusammengeführt.
              </div>
              <IgdbPicker initial={game.title} onPick={pick} selectedId={game.igdbId} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-2">
      <div className="text-[11px] text-white/50">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
