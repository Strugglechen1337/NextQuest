"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { GameMeta } from "@/lib/library";
import { PLATFORM_ORDER, PLATFORMS, type PlatformId } from "@/lib/platforms";
import { IgdbPicker } from "./IgdbPicker";
import { Modal } from "./ui";

export function AddGameDialog({
  open,
  igdb,
  onClose,
  onAdded,
}: {
  open: boolean;
  igdb: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState<GameMeta | null>(null);
  const [platform, setPlatform] = useState<PlatformId>("switch");
  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle("");
    setMeta(null);
    setHours("");
    setError(null);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || (!meta && !title.trim())) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/games", {
        body: { title: meta?.title ?? title, platform, playtimeHours: Number(hours.replace(",", ".")) || 0, meta },
      });
      reset();
      onAdded();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Spiel hinzufügen"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost flex-1 sm:flex-initial" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => submit()}
            className="btn-primary flex-1 sm:flex-initial"
            disabled={busy || (!meta && !title.trim())}
          >
            Hinzufügen
          </button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-white/65">
          Für Plattformen ohne Schnittstelle (z. B. Switch, Ubisoft) oder Spiele, die fehlen.
        </p>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-white/60">Plattform</span>
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as PlatformId)}>
            {PLATFORM_ORDER.filter((p) => PLATFORMS[p].manual).map((p) => (
              <option key={p} value={p}>
                {PLATFORMS[p].label}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-white/60">Spiel</span>
          {igdb ? (
            <>
              <IgdbPicker initial="" onPick={setMeta} selectedId={meta?.igdbId} />
              {meta && <div className="text-xs text-emerald-300">Ausgewählt: {meta.title}</div>}
            </>
          ) : (
            <>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titel des Spiels"
              />
              <div className="text-xs text-white/45">
                Tipp: Mit eingerichtetem IGDB-Zugang bekommst du Suche, Cover und Spieldauer automatisch.
              </div>
            </>
          )}
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-white/60">Bisherige Spielzeit in Stunden (optional)</span>
          <input
            className="input"
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="z. B. 12,5"
          />
        </label>

        {error && <div className="text-sm text-red-300">{error}</div>}
      </form>
    </Modal>
  );
}
