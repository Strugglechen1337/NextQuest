const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const ts = require('typescript');

const realLoad = Module._load;
Module._load = function (name, parent, main) {
  if (name === 'server-only') return {};
  return realLoad.call(this, name, parent, main);
};
require.extensions['.ts'] = function (mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};

const updateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextquest-maint-'));
process.env.NEXTQUEST_UPDATE_DIR = updateDir;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextquest-maint-db-'));
const { maintenanceActive, MAINTENANCE_MESSAGE } = require('../src/lib/maintenance.ts');
const { startJob, schedulerTick, jobsStatus } = require('../src/lib/jobs.ts');
const { setSetting } = require('../src/lib/settings.ts');
const lock = path.join(updateDir, 'maintenance.lock');

test('no lock → not active', () => {
  assert.equal(maintenanceActive(), false);
});

test('lock blocks new jobs and the scheduler, without consuming the nightly run', () => {
  fs.writeFileSync(lock, 'update');
  assert.equal(maintenanceActive(), true);
  assert.throws(() => startJob('enrich'), new RegExp(MAINTENANCE_MESSAGE.slice(0, 20)));
  setSetting('auto.enabled', '1'); setSetting('auto.time', '04:00');
  setSetting('auto.lastRun', new Date(2026, 10, 5, 4).toISOString());
  assert.equal(schedulerTick(new Date(2026, 10, 9, 4, 5)), undefined);
  assert.equal(jobsStatus().running, null);
  fs.rmSync(lock);
  assert.equal(maintenanceActive(), false);
});

test('stale lock (older than 2 hours) is ignored', () => {
  fs.writeFileSync(lock, 'old');
  const old = new Date(Date.now() - 3 * 3600_000);
  fs.utimesSync(lock, old, old);
  assert.equal(maintenanceActive(), false);
  fs.rmSync(lock);
});
