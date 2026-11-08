import "server-only";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import { assertNoMaintenance } from "./maintenance";
import { getSetting, setSetting } from "./settings";

const pattern = /^nextquest-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)\.sqlite3$/;
const retention = 7 * 24 * 60 * 60 * 1000;
export const backupEnabled = () => process.env.NEXTQUEST_APP_BACKUP !== "0";
export const backupDirectory = () => path.resolve(/*turbopackIgnore: true*/ process.env.NEXTQUEST_BACKUP_DIR || path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "backups"));
function files(dir: string) {
  try { return fs.readdirSync(dir).filter(name => pattern.test(name)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
}
export function backupStatus() {
  return { enabled: backupEnabled(), directory: backupDirectory(), count: files(backupDirectory()).length, last: getSetting("backup.last") };
}
export function createBackup(now = new Date()) {
  assertNoMaintenance();
  if (!backupEnabled()) throw new Error("App-Sicherung ist deaktiviert.");
  const dir = backupDirectory();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(dir, 0o700);
  const name = `nextquest-${now.toISOString().replace(/:/g, "-")}.sqlite3`;
  const target = path.join(dir, name);
  if (fs.existsSync(target)) throw new Error("Sicherung existiert bereits.");
  // SQLite creates the file itself; restrict permissions from creation onward.
  const oldMask = process.umask(0o077);
  try {
    db().prepare("VACUUM INTO ?").run(target);
    if (process.platform !== "win32") fs.chmodSync(target, 0o600);
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
    const snapshot = new DatabaseSync(target, { readOnly: true });
    try {
      const result = snapshot.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
      if (result.length !== 1 || result[0].integrity_check !== "ok") throw new Error("Integritätsprüfung der Sicherung fehlgeschlagen.");
    } finally { snapshot.close(); }
  } catch (e) { fs.rmSync(target, { force: true }); throw e; }
  finally { process.umask(oldMask); }
  setSetting("backup.last", now.toISOString());
  for (const file of files(dir)) {
    const stamp = pattern.exec(file)![1].replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
    const time = Date.parse(stamp);
    if (Number.isFinite(time) && time < now.getTime() - retention) fs.rmSync(path.join(dir, file), { force: true });
  }
  return target;
}
