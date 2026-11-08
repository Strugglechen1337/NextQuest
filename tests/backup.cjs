const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const test = require('node:test');
const ts = require('typescript');
const load = Module._load;
Module._load = function(name, parent, main) { return name === 'server-only' ? {} : load.call(this, name, parent, main); };
require.extensions['.ts'] = function(mod, filename) { mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, filename); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextquest-backup-'));
process.env.DATA_DIR = dir;
const { db } = require('../src/lib/db.ts');
const { createBackup, backupStatus } = require('../src/lib/backup.ts');
const { runtime, updateMode } = require('../src/lib/runtime.ts');
test('runtime and update presentation', () => {
  for (const value of ['linux', 'docker', 'windows']) assert.equal(runtime(value), value);
  assert.equal(runtime('unexpected'), 'dev');
  assert.equal(updateMode('linux').showUpdater, true);
  for (const value of ['docker', 'windows', 'dev']) assert.equal(updateMode(value).showUpdater, false);
  assert.match(updateMode('docker').message, /docker compose pull/);
  assert.match(updateMode('windows').message, /automatisch/);
  assert.equal(updateMode('dev').message, null);
});
test('snapshot integrity, retention and private permissions', () => {
  db().prepare('INSERT INTO settings VALUES (?, ?)').run('fixture', 'saved');
  const backupDir = path.join(dir, 'backups'); fs.mkdirSync(backupDir);
  for (const name of ['nextquest-2026-01-01T00-00-00.000Z.sqlite3', 'nextquest-2026-01-09T00-00-00.000Z.sqlite3', 'other.sqlite3']) fs.writeFileSync(path.join(backupDir, name), 'keep');
  const file = createBackup(new Date('2026-01-10T00:00:00.000Z'));
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const snapshot = new DatabaseSync(file, { readOnly: true });
  assert.equal(snapshot.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(snapshot.prepare('SELECT value FROM settings WHERE key = ?').get('fixture').value, 'saved'); snapshot.close();
  assert.equal(fs.existsSync(path.join(backupDir, 'nextquest-2026-01-01T00-00-00.000Z.sqlite3')), false);
  assert.equal(fs.existsSync(path.join(backupDir, 'other.sqlite3')), true);
  assert.equal(backupStatus().count, 2);
  if (process.platform !== 'win32') { assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert.equal(fs.statSync(backupDir).mode & 0o777, 0o700); }
});
test('disabled and maintenance block backups', () => {
  process.env.NEXTQUEST_APP_BACKUP = '0'; assert.throws(() => createBackup(), /deaktiviert/); delete process.env.NEXTQUEST_APP_BACKUP;
  process.env.NEXTQUEST_UPDATE_DIR = dir; fs.writeFileSync(path.join(dir, 'maintenance.lock'), '');
  assert.throws(() => createBackup(), /Update/); fs.rmSync(path.join(dir, 'maintenance.lock')); delete process.env.NEXTQUEST_UPDATE_DIR;
});
test.after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });
