"use client";
import { useState } from "react";
import type { Game } from "@/lib/types";
import { GAME_STATUSES, effectiveStatus } from "@/lib/game-status";
import { api } from "@/lib/client";
export function GameJournal({ game, onChanged }: { game: Game; onChanged: () => void }) {
  const [note, setNote] = useState(game.userNote ?? "");
  const [rating, setRating] = useState(game.userRating ?? 0);
  const [status, setStatus] = useState(effectiveStatus(game.status, game.completed));
  const [completedOn, setCompletedOn] = useState(game.completedOn ?? "");
  const [dateChanged, setDateChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true); setMessage("");
    try { await api(`/api/games/${game.id}`, { method: "PATCH", body: { status, userNote: note, userRating: rating || null, ...(dateChanged ? { completedOn: completedOn || null } : {}) } }); onChanged(); setMessage("Gespeichert"); }
    catch(e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="card space-y-3 p-3">
    <label className="block space-y-1 text-sm"><span>Status</span><select className="input" value={status} onChange={e => setStatus(e.target.value as typeof status)}>{Object.entries(GAME_STATUSES).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    {status === "completed" && <label className="block space-y-1 text-sm"><span>Abschlussdatum</span><input className="input" type="date" value={completedOn} onChange={e => { setCompletedOn(e.target.value); setDateChanged(true); }} /><span className="block text-xs text-white/55">Ohne Angabe wird nach Möglichkeit das Datum des letzten Erfolgs vorgeschlagen.</span></label>}
    <fieldset><legend className="text-sm text-white/65">Meine Bewertung</legend><div className="flex flex-wrap items-center gap-1">{[1,2,3,4,5].map(n => <button key={n} type="button" className={`min-h-11 min-w-9 text-2xl ${rating >= n ? "text-amber-300" : "text-white/30"}`} aria-label={`${n} ${n === 1 ? "Stern" : "Sterne"}`} aria-pressed={rating === n} onClick={() => setRating(n)}>★</button>)}<button type="button" className="min-h-11 px-2 text-xs text-white/55" onClick={() => setRating(0)}>Zurücksetzen</button></div></fieldset>
    <label className="block space-y-1 text-sm"><span>Eigene Notiz</span><textarea className="input min-h-24 resize-y" maxLength={20000} value={note} onChange={e => setNote(e.target.value)} placeholder="Deine Gedanken zum Spiel …" /></label>
    <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn-primary" disabled={busy} onClick={save}>Speichern</button><span role="status" className="text-xs text-white/65">{message}</span></div>
  </div>;
}
