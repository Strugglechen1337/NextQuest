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
    <Modal open onClose={onClose} wide>
      <div className="flex flex-col gap-5 sm:flex-row">
        <Cover src={game.coverUrl} title={game.title} className="aspect-[3/4] w-40 shrink-0 self-start rounded-xl" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="pr-8 text-xl font-bold">{game.title}</h2>
            <div className="text-sm text-white/50">
              {game.releaseYear ?? ""}
              {game.genres.length ? ` · ${game.genres.slice(0, 4).join(", ")}` : ""}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Deine Spielzeit" value={formatMinutes(game.playtimeMin)} />
            <Stat label="Bewertung" value={game.rating ? `${Math.round(game.rating)}/100` : "–"} />
            <Stat
              label="Beliebtheit"
              value={game.ratingCount ? `${game.ratingCount.toLocaleString("de-DE")} Stimmen` : "–"}
            />
            <Stat label="Exemplare" value={game.copies ? `${game.copies}×` : "Game Pass"} />
          </div>

          <div className="card p-3">
            <div className="mb-1.5 text-xs uppercase tracking-wide text-white/40">Spieldauer</div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-white/50">Zügig</div>
                <div className="font-semibold">{formatMinutes(game.ttbHastily)}</div>
              </div>
              <div>
                <div className="text-white/50">Normal</div>
                <div className="font-semibold">{formatMinutes(game.ttbNormally)}</div>
              </div>
              <div>
                <div className="text-white/50">100 %</div>
                <div className="font-semibold">{formatMinutes(game.ttbCompletely)}</div>
              </div>
            </div>
          </div>

          {game.summary && <p className="line-clamp-4 text-sm text-white/70">{game.summary}</p>}

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-white/40">Wo du es hast</div>
            <div className="divide-y divide-white/5 rounded-xl border border-white/10">
              {game.ownerships.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <PlatformPill platform={o.platform} size="md" />
                  <span className="min-w-0 flex-1 truncate text-white/70" title={o.title}>
                    {o.title}
                  </span>
                  <span className="text-white/50">
                    {PLATFORMS[o.platform]?.subscription ? "Abo" : formatMinutes(o.playtimeMin)}
                  </span>
                  {game.ownerships.length > 1 && (
                    <button
                      disabled={busy}
                      className="text-xs text-white/40 hover:text-white"
                      title="Falsch zugeordnet? Als eigenes Spiel abtrennen"
                      onClick={() => run(() => api(`/api/ownerships/${o.id}`, { body: {} }), true)}
                    >
                      abtrennen
                    </button>
                  )}
                  {o.source !== "sync" && (
                    <button
                      disabled={busy}
                      className="text-xs text-red-300/70 hover:text-red-300"
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

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              disabled={busy}
              className={game.completed ? "btn-ghost" : "btn-primary"}
              onClick={() =>
                run(() => api(`/api/games/${game.id}`, { method: "PATCH", body: { completed: !game.completed } }))
              }
            >
              {game.completed ? "↺ Wieder als offen markieren" : "✓ Als durchgespielt abhaken"}
            </button>
            {igdb && (
              <button className="btn-ghost" onClick={() => setRematch((v) => !v)}>
                Zuordnung ändern
              </button>
            )}
          </div>

          {rematch && (
            <div className="card space-y-2 p-3">
              <div className="text-sm text-white/60">
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
      <div className="text-[11px] text-white/45">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
