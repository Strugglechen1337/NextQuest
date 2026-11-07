import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type UpdateStatus = { state: string; step: string; from: string; to: string; startedAt: string; endedAt: string | null; source: string; message: string; log: string[] };
type Change = { sha: string; message: string; date: string };
type Version = { latest: string | null; available: boolean; behindBy: number | null; changes: Change[]; error: string | null };
let cache: { current: string; expires: number; value: Version } | null = null;
const base = "https://api.github.com/repos/Strugglechen1337/NextQuest";

export async function versions(current: string): Promise<Version> {
  if (cache && cache.current === current && cache.expires > Date.now()) return cache.value;
  let value: Version = { latest: null, available: false, behindBy: null, changes: [], error: null };
  try {
    const get = async (url: string) => {
      const r = await fetch(url, { headers: { "User-Agent": "NextQuest-Updater", Accept: "application/vnd.github+json" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error("GitHub nicht erreichbar");
      return r.json();
    };
    const latest = await get(`${base}/commits/main`);
    if (typeof latest.sha !== "string" || !/^[a-f0-9]{40}$/i.test(latest.sha)) throw new Error("Ungültige Antwort");
    value.latest = latest.sha;
    if (/^[a-f0-9]{7,40}$/i.test(current)) {
      if (latest.sha.toLowerCase().startsWith(current.toLowerCase())) value.behindBy = 0;
      else {
        const comparison = await get(`${base}/compare/${current}...main`);
        if (!Number.isInteger(comparison.ahead_by) || !Array.isArray(comparison.commits)) throw new Error("Ungültige Antwort");
        value.behindBy = comparison.ahead_by;
        value.available = comparison.ahead_by > 0 && comparison.behind_by === 0;
        value.changes = comparison.commits.slice(0, 20).map((c: { sha?: string; commit?: { message?: string; author?: { date?: string } } }) => ({ sha: c.sha ?? "", message: (c.commit?.message ?? "").split("\n")[0], date: c.commit?.author?.date ?? "" }));
      }
    }
  } catch { value = { ...value, available: false, behindBy: null, changes: [], error: "Prüfung gerade nicht möglich" }; }
  cache = { current, expires: Date.now() + 600000, value };
  return value;
}
export async function updateDirectory(): Promise<string | null> {
  const dir = process.env.NEXTQUEST_UPDATE_DIR;
  if (!dir) return null;
  try { return (await fs.stat(dir)).isDirectory() ? dir : null; } catch { return null; }
}
export async function readStatus(dir: string | null): Promise<UpdateStatus | null> {
  if (!dir) return null;
  try {
    const s = JSON.parse(await fs.readFile(path.join(dir, "status.json"), "utf8"));
    if (!s || !["idle", "running", "success", "failed", "rolled-back", "up-to-date"].includes(s.state)) return null;
    return { state: s.state, step: typeof s.step === "string" ? s.step : "", from: typeof s.from === "string" ? s.from : "", to: typeof s.to === "string" ? s.to : "", startedAt: typeof s.startedAt === "string" ? s.startedAt : "", endedAt: typeof s.endedAt === "string" ? s.endedAt : null, source: typeof s.source === "string" ? s.source : "", message: typeof s.message === "string" ? s.message : "", log: Array.isArray(s.log) ? s.log.filter((x: unknown) => typeof x === "string").slice(-50) : [] };
  } catch { return null; }
}
export async function requestUpdate(): Promise<void> {
  const dir = await updateDirectory();
  if (!dir) throw new Error("Der Updater ist auf diesem Server nicht eingerichtet");
  if ((await readStatus(dir))?.state === "running") throw new Error("Ein Update läuft bereits.");
  const temp = path.join(dir, `.request-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify({ requestedAt: new Date().toISOString(), source: "manual" }), { flag: "wx" });
    // Hard link publishes the complete file atomically and never replaces a pending request.
    await fs.link(temp, path.join(dir, "request.json"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Ein Update wurde bereits angefordert.");
    throw e;
  } finally { await fs.unlink(temp).catch(() => {}); }
}
