"use client";
import { useEffect, useRef, useState } from "react";
import { Step } from "./parts";

type Info = { current: string; latest: string | null; available: boolean; behindBy: number | null; changes: { sha: string; message: string; date: string }[]; status: { state: string; step: string; message: string; log: string[] } | null; auto: boolean; configured: boolean; error: string | null };
export function Updates() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const active = useRef(false);
  const offline = useRef(false);
  const seenRunning = useRef(false);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetch("/api/update", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const data: Info = await r.json();
        if (!live) return;
        if (offline.current) { window.location.reload(); return; }
        setInfo(data);
        if (data.status?.state === "running") { active.current = true; seenRunning.current = true; }
        if (seenRunning.current && data.status && data.status.state !== "running") { active.current = false; seenRunning.current = false; }
      } catch {
        if (!live) return;
        if (active.current) { offline.current = true; setRestarting(true); }
        else setError("Update-Status konnte nicht geladen werden.");
      }
    };
    void load();
    const timer = setInterval(load, 2000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  const post = async (body: object) => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if ("action" in body) active.current = true;
      if ("auto" in body && info) setInfo({ ...info, auto: Boolean(body.auto) });
    } catch (e) { setError(e instanceof Error ? e.message : "Anfrage fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  return <Step n="↑" title="Updates" subtitle="NextQuest aktuell halten – mit Sicherung und automatischem Zurücksetzen bei Fehlern">
    {info && <>
      <p className="text-sm text-white/70">Laufende Version: <code>{info.current.slice(0, 12)}</code><br />Neueste Version: <code>{info.latest?.slice(0, 12) ?? "unbekannt"}</code></p>
      {info.error && <p className="text-sm text-white/60">{info.error}</p>}
      {info.available && <p className="text-sm text-emerald-300">Update verfügbar · {info.behindBy} neue Commits</p>}
      {info.changes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-white/70">{info.changes.map(c => <li key={c.sha}>{c.message}</li>)}</ul>}
      {info.configured ? <>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-violet-500" checked={info.auto} disabled={busy} onChange={e => void post({ auto: e.target.checked })} />Nachts automatisch aktualisieren (03:45)</label>
        <button type="button" className="btn-primary" disabled={busy || info.status?.state === "running"} onClick={() => { if (confirm("Update jetzt starten? Die App wird kurz neu gestartet.")) void post({ action: "start" }); }}>Jetzt aktualisieren</button>
      </> : <p className="text-sm text-white/65">Der Updater ist auf diesem Server nicht eingerichtet</p>}
      {restarting && <p role="status" className="text-sm text-violet-300">App startet neu …</p>}
      {info.status && <div className="space-y-2 text-sm" role="status"><p>{info.status.step}</p><p className="text-white/65">{info.status.message}</p>{info.status.log.length > 0 && <details><summary className="cursor-pointer text-white/65">Protokoll anzeigen</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs">{info.status.log.join("\n")}</pre></details>}</div>}
    </>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </Step>;
}

