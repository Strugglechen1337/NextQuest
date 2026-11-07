/* eslint-disable @typescript-eslint/no-require-imports -- Real TS/SQLite fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const ts = require('typescript');
const realLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === 'server-only') return {};
  return realLoad.call(this, name, parent, main);
};
require.extensions['.ts'] = function(mod, filename) {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextquest-jobs-'));
process.env.DATA_DIR = dir;
const { db } = require('../src/lib/db.ts');
const { setSetting, getSetting } = require('../src/lib/settings.ts');
const { upsertOwnership } = require('../src/lib/library.ts');
const { startJob, jobsStatus, schedule, schedulerTick } = require('../src/lib/jobs.ts');
const schema = () => db().prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name").all();
const before = schema();
async function finished(job) {
  for (let i = 0; i < 500; i++) {
    if (!jobsStatus().running) return jobsStatus().last;
    await new Promise(r => setTimeout(r, 10));
  }
  assert.fail(`Job ${job.id} did not finish`);
}
test('single-flight survives caller detachment, reports platform errors, continues and persists without changing schema', async () => {
  setSetting('steam.apiKey', 'fixture'); setSetting('steam.steamId', '123');
  setSetting('xbox.apiKey', 'fixture'); setSetting('xbox.xuid', '123');
  let release;
  const gate = new Promise(r => { release = r; });
  const requested = [];
  global.fetch = async url => {
    requested.push(String(url));
    if (String(url).includes('steampowered.com')) { await gate; throw new Error('Steam fixture offline'); }
    if (String(url).includes('titleHistory')) return Response.json({ titles: [{ titleId: '42', name: 'Fixture Game', type: 'Game' }] });
    if (String(url).includes('/stats')) return Response.json({ users: [] });
    throw new Error(`Unexpected URL ${url}`);
  };
  const first = startJob('sync-all');
  assert.equal(startJob('enrich-refresh').id, first.id);
  await new Promise(r => setImmediate(r));
  assert.equal(jobsStatus().running.id, first.id);
  release();
  const last = await finished(first);
  assert.match(last.errors.Steam, /offline/);
  assert.equal(last.platforms.Steam.ok, false);
  assert.equal(last.platforms.Xbox.ok, true);
  assert.ok(requested.some(u => u.includes('titleHistory')));
  assert.ok(db().prepare("SELECT * FROM ownerships WHERE platform='xbox'").get());
  assert.deepEqual(JSON.parse(getSetting('jobs.last')), last);
  // Loading a new runner module still sees the process-wide flight and persisted last.
  delete require.cache[require.resolve('../src/lib/jobs.ts')];
  assert.deepEqual(require('../src/lib/jobs.ts').jobsStatus().last, last);
  assert.deepEqual(schema(), before);
});
test('description cooldown exits cleanly and can continue on a future run', async () => {
  upsertOwnership({ platform: 'steam', externalId: '999', title: 'Description fixture' });
  global.fetch = async () => new Response('', { status: 429, headers: { 'retry-after': '300' } });
  const last = await finished(startJob('descriptions'));
  assert.match(last.note, /wird beim nächsten Lauf fortgesetzt/);
  assert.ok(last.remaining > 0);
  assert.deepEqual(last.errors, {});
  const again = await finished(startJob('descriptions'));
  assert.match(again.note, /fortgesetzt/);
  assert.equal(again.done, 0);
});
test('local scheduler computes before/after, catches up once and preserves daily single-flight', async () => {
  const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute);
  assert.equal(schedule(at(7, 3), '04:00', null).due, false);
  assert.equal(schedule(at(7, 4), '04:00', null).due, true);
  assert.equal(schedule(at(7, 5), '04:00', at(7, 4).toISOString()).due, false);
  assert.equal(schedule(at(9, 2), '04:00', at(5, 4).toISOString()).due, true);
  assert.equal(schedule(at(9, 2), '04:00', at(9, 1).toISOString()).due, false);
  assert.equal(schedule(at(9, 2), '04:00', null).next.getHours(), 4);
  // Calendar arithmetic follows the server TZ across daylight-saving changes.
  const previousTZ = process.env.TZ;
  process.env.TZ = 'Europe/Berlin';
  try {
    const spring = schedule(new Date(2026, 2, 29, 5), '02:30', new Date(2026, 2, 29, 4).toISOString());
    assert.equal(spring.next.getDate(), 30);
    assert.equal(spring.next.getHours(), 2);
    assert.equal(spring.next.getMinutes(), 30);
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
  setSetting('auto.enabled', '0');
  assert.equal(schedulerTick(at(9, 5)), undefined);
  setSetting('auto.enabled', '1'); setSetting('auto.time', '04:00');
  setSetting('auto.lastRun', at(5, 4).toISOString());
  const busy = startJob('enrich');
  assert.equal(schedulerTick(at(9, 2)), undefined);
  assert.equal(getSetting('auto.lastRun'), at(5, 4).toISOString());
  await finished(busy);
  const catchup = schedulerTick(at(9, 2));
  assert.ok(catchup);
  await finished(catchup);
  assert.equal(getSetting('auto.lastRun'), at(9, 2).toISOString());
  assert.equal(schedulerTick(at(9, 2, 1)), undefined);
  assert.equal(schedulerTick(at(9, 3)), undefined);
  assert.ok(schedulerTick(at(9, 4)));
  await finished(jobsStatus().running);
  assert.deepEqual(schema(), before);
});
test.after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });
