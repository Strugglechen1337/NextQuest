import "server-only";
import { randomUUID } from "node:crypto";
import { enrichBatch, igdbConfigured, refreshMetadata, resetNotFound } from "./igdb";
import { descriptionsBatch } from "./descriptions";
import { steamTagsBatch } from "./steam-tags";
import { getSetting, setSetting } from "./settings";
import { syncSteam } from "./steam";
import { syncXbox } from "./xbox";
import { syncPlayStation } from "./playstation";
import { syncGog } from "./gog";
import { syncEpic } from "./epic";
import { syncGamePass } from "./gamepass";
import type { Job, JobKind, JobsStatus } from "./job-types";
import { assertNoMaintenance, maintenanceActive } from "./maintenance";

const globalJobs = globalThis as typeof globalThis & { nextQuestJobs?: { running: Job | null; timer?: ReturnType<typeof setInterval> } };
const state = globalJobs.nextQuestJobs ??= { running: null };
const errorText = (e: unknown) => e instanceof Error ? e.message : "Unbekannter Fehler";
export const validAutoTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Most recent local calendar slot, including yesterday before today's slot. */
export function schedule(now: Date, time: string, lastRun: string | null) {
  const [hour, minute] = (validAutoTime(time) ? time : "04:00").split(":").map(Number);
  const slot = new Date(now);
  slot.setHours(hour, minute, 0, 0);
  const beforeToday = slot > now;
  if (beforeToday) {
    slot.setDate(slot.getDate() - 1);
    slot.setHours(hour, minute, 0, 0);
  }
  const due = lastRun ? Date.parse(lastRun) < slot.getTime() : !beforeToday;
  const next = new Date(slot);
  next.setDate(next.getDate() + 1);
  next.setHours(hour, minute, 0, 0);
  return { due, slot, next };
}

export function jobsStatus(now = new Date()): JobsStatus {
  let last: Job | null = null;
  try { last = JSON.parse(getSetting("jobs.last") ?? "null"); } catch { /* Ignore an invalid historical entry. */ }
  const auto = { enabled: getSetting("auto.enabled") !== "0", time: getSetting("auto.time") ?? "04:00", lastRun: getSetting("auto.lastRun") };
  const plan = schedule(now, auto.time, auto.lastRun);
  return { running: state.running, activeSyncs: activeSyncCount(), last, auto, nextRun: auto.enabled ? (plan.due ? now : plan.next).toISOString() : null };
}

const syncCounter = globalThis as unknown as { __nextquestActiveSyncs?: number };
export function activeSyncCount() {
  return syncCounter.__nextquestActiveSyncs ?? 0;
}
/** Zählt direkte Abgleiche mit, damit der Server-Updater auf sie warten kann. */
export async function trackSync<T>(fn: () => Promise<T>): Promise<T> {
  syncCounter.__nextquestActiveSyncs = activeSyncCount() + 1;
  try {
    return await fn();
  } finally {
    syncCounter.__nextquestActiveSyncs = Math.max(0, activeSyncCount() - 1);
  }
}

async function batches(job: Job, descriptions = false) {
  job.step = descriptions ? "Deutsche Beschreibungen" : "Spieldaten";
  job.done = 0;
  job.remaining = 0;
  if (!descriptions && !igdbConfigured()) return;
  for (;;) {
    const r = descriptions ? await descriptionsBatch() : await enrichBatch(40);
    job.done += r.processed;
    job.remaining = r.remaining;
    if ("rateLimited" in r && r.rateLimited) {
      job.note = "Steam-Anfragelimit erreicht – wird beim nächsten Lauf fortgesetzt";
      return;
    }
    if (!r.remaining || !r.processed) return;
  }
}

async function execute(job: Job) {
  try {
    if (job.kind === "sync-all") {
      const platforms: [string, boolean, () => Promise<unknown>][] = [
        ["Steam", !!getSetting("steam.apiKey") && !!getSetting("steam.steamId"), syncSteam],
        ["Xbox", !!getSetting("xbox.apiKey") && !!getSetting("xbox.xuid"), syncXbox],
        ["PlayStation", !!getSetting("psn.refreshToken"), syncPlayStation],
        ["GOG", !!getSetting("gog.refreshToken"), syncGog],
        ["Epic", !!getSetting("epic.refreshToken"), syncEpic],
        ["Game Pass", getSetting("gamepass.enabled") === "1", syncGamePass],
      ];
      for (const [name, configured, sync] of platforms) {
        if (!configured) continue;
        job.step = name;
        try { job.platforms[name] = { ok: true, result: await sync() }; }
        catch (e) {
          const error = errorText(e);
          job.errors[name] = error;
          job.platforms[name] = { ok: false, error };
        }
      }
      // Metadata failures must not prevent the independent description stage.
      try { await batches(job); } catch (e) { job.errors.Spieldaten = errorText(e); }
      await batches(job, true);
    } else {
      if (job.kind === "enrich-refresh") refreshMetadata();
      if (job.kind === "enrich-retry") resetNotFound();
      await batches(job, job.kind === "descriptions");
    }
  } catch (e) { job.errors[job.step] = errorText(e); }
  finally {
    if (job.kind === "sync-all" || job.kind === "descriptions") {
      job.step = "Steam-Tags";
      try { await steamTagsBatch(); } catch (e) { job.errors["Steam-Tags"] = errorText(e); }
    }
    job.endedAt = new Date().toISOString();
    try { setSetting("jobs.last", JSON.stringify(job)); }
    catch (e) { console.error("[NextQuest] Job-Ergebnis konnte nicht gespeichert werden", e); }
    state.running = null;
  }
}

export function startJob(kind: JobKind): Job {
  if (state.running) return state.running;
  // Während eines Server-Updates keine neuen Jobs (siehe maintenance.ts)
  assertNoMaintenance();
  const job: Job = { id: randomUUID(), kind, startedAt: new Date().toISOString(), step: "Start", done: 0, remaining: 0, errors: {}, platforms: {} };
  state.running = job;
  // Detach execution from the request and its AbortSignal, retaining single-flight
  // before any asynchronous work begins.
  setImmediate(() => { void execute(job); });
  return job;
}

export function schedulerTick(now = new Date()) {
  // Während eines Updates nichts starten; der fällige Lauf wird nach dem Update nachgeholt.
  // Alter der Sperre immer gegen die echte Uhrzeit prüfen, nicht gegen den simulierten Zeitpunkt
  if (maintenanceActive()) return;
  const status = jobsStatus(now);
  // Erster Start (noch nie gelaufen): nur Startpunkt merken, nicht sofort alles abgleichen.
  // Der erste automatische Lauf kommt zur nächsten eingestellten Uhrzeit.
  if (status.auto.enabled && !status.auto.lastRun) {
    setSetting("auto.lastRun", now.toISOString());
    return;
  }
  if (!status.auto.enabled || state.running || !schedule(now, status.auto.time, status.auto.lastRun).due) return;
  // Record before launch: failed/interrupted runs are retried next day, not every minute.
  setSetting("auto.lastRun", now.toISOString());
  return startJob("sync-all");
}

export function startScheduler() {
  if (state.timer) return;
  const tick = () => { try { schedulerTick(); } catch (e) { console.error("[NextQuest] Automatik", e); } };
  state.timer = setInterval(tick, 60_000);
  state.timer.unref();
  tick();
}
