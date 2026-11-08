"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { JobsStatus } from "@/lib/job-types";
import { Step, fmtDate } from "./parts";

export function Backup() {
  const [status, setStatus] = useState<JobsStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => api<JobsStatus>("/api/jobs").then(s => { if (live) setStatus(s); }, e => { if (live) setError(e.message); });
    void load();
    const timer = setInterval(load, 2000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  const start = async () => {
    try { await api("/api/jobs", { body: { kind: "backup" } }); setStatus(await api<JobsStatus>("/api/jobs")); setError(""); }
    catch (e) { setError((e as Error).message); }
  };
  return <Step n="↓" title="Sicherung" subtitle="SQLite-Sicherungen werden sieben Tage aufbewahrt">
    {status && <>
      <p className="text-sm text-white/65">Letzte Sicherung: {status.backup.last ? fmtDate(status.backup.last) : "Noch keine"}<br />Anzahl: {status.backup.count}<br />Speicherort: <code>{status.backup.directory}</code></p>
      {status.backup.enabled ? <button type="button" className="btn-primary" disabled={!!status.running} onClick={start}>Jetzt sichern</button> : <p className="text-sm text-white/65">App-Sicherung ist deaktiviert.</p>}
      {status.last?.kind === "backup" && Object.entries(status.last.errors).map(([key, message]) => <p key={key} className="text-sm text-red-300">{message}</p>)}
    </>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </Step>;
}
