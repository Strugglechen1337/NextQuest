"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Job, JobsStatus } from "@/lib/job-types";
import { Step, fmtDate } from "./parts";

const KIND_LABELS: Record<string, string> = {
  "sync-all": "Kompletter Abgleich",
  backup: "Sicherung",
  enrich: "Spieldaten",
  "enrich-refresh": "Spieldaten aktualisiert",
  "enrich-retry": "Nicht gefundene neu gesucht",
  descriptions: "Deutsche Beschreibungen",
};

function result(job: Job) {
  return Object.entries(job.platforms).map(([name, r]) => `${name} ${r.ok ? "✓" : `✗ ${r.error}`}`).join(", ");
}

export function Automation() {
  const [status, setStatus] = useState<JobsStatus | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => api<JobsStatus>("/api/jobs").then(s => { if (active) setStatus(s); }, e => { if (active) setError(e.message); });
    void load();
    const timer = setInterval(load, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const save = async (body: Record<string, string>) => {
    setSaving(true);
    try {
      await api("/api/settings", { body });
      setStatus(await api<JobsStatus>("/api/jobs"));
      setError("");
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const start = async () => {
    try {
      await api("/api/jobs", { body: { kind: "sync-all" } });
      setStatus(await api<JobsStatus>("/api/jobs"));
      setError("");
    } catch (e) { setError((e as Error).message); }
  };
  const job = status?.running;
  return <Step n="↻" title="Automatik" subtitle="Plattformen, Spieldaten und deutsche Beschreibungen">
    {status && <>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={status.auto.enabled} disabled={saving} onChange={e => void save({ "auto.enabled": e.target.checked ? "1" : "0" })} />
        Täglich automatisch abgleichen
      </label>
      <label className="flex items-center gap-3 text-sm">Uhrzeit (Server-Ortszeit)
        <input type="time" className="input w-auto" defaultValue={status.auto.time} disabled={saving} onBlur={e => { if (e.target.value !== status.auto.time) void save({ "auto.time": e.target.value }); }} />
      </label>
      <button type="button" className="btn-primary" disabled={!!job} onClick={start}>Jetzt alles abgleichen</button>
      {job && <div className="space-y-2 text-sm" role="status">
        <p>Läuft auf dem Server – du kannst die Seite schließen.</p>
        <p>{job.step}: {job.done} erledigt, {job.remaining} offen</p>
        <progress className="w-full accent-violet-500" value={job.done} max={Math.max(1, job.done + job.remaining)} />
      </div>}
      <p className="text-sm text-white/65">Letzter Lauf: {status.last ? `${fmtDate(status.last.endedAt ?? status.last.startedAt)} (${KIND_LABELS[status.last.kind] ?? status.last.kind}${status.last.endedAt ? " – fertig" : " – läuft/abgebrochen"}${result(status.last) ? ` · ${result(status.last)}` : ""})` : "Noch keiner"}</p>
      {status.last?.note && <p className="text-sm text-white/65">{status.last.note}</p>}
      {status.last && Object.entries(status.last.errors).filter(([name]) => !status.last!.platforms[name]).map(([name, message]) => <p key={name} className="text-sm text-red-300">{name}: {message}</p>)}
      <p className="text-sm text-white/65">Sicherung vor dem automatischen Abgleich: {status.backup.enabled ? "aktiv" : "deaktiviert"}</p>
      <p className="text-sm text-white/65">Nächster Lauf: {status.nextRun ? fmtDate(status.nextRun) : "Ausgeschaltet"}</p>
    </>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </Step>;
}
