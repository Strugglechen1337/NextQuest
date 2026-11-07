/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS module loader fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const ts = require('typescript');

// Load the real TypeScript modules and SQLite store, with no real network access.
const realLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === 'server-only') return {};
  return realLoad.call(this, name, parent, main);
};
require.extensions['.ts'] = function(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'nextquest-xbox-fixture-'));
process.env.DATA_DIR = dir;
const { db } = require('../src/lib/db.ts');
const { upsertOwnership } = require('../src/lib/library.ts');
const { setSetting } = require('../src/lib/settings.ts');
const { syncXbox } = require('../src/lib/xbox.ts');
const game = (id) => ({ titleId: id, name: `Game ${id}`, type: 'Game' });
function reset() {
  db().exec('DELETE FROM ownerships; DELETE FROM games; DELETE FROM settings');
  setSetting('xbox.apiKey', 'fixture-only'); setSetting('xbox.xuid', '123');
  for (const id of ['1', '2']) upsertOwnership({platform:'xbox', externalId:id, title:`Game ${id}`, playtimeMin:99});
}
function responses(history, achievements) {
  global.fetch = async (url) => {
    const p = new URL(url).pathname;
    if (p === '/v2/player/titleHistory') return Response.json(history);
    if (p === '/v2/achievements') {
      if (achievements instanceof Error) throw achievements;
      return Response.json(achievements);
    }
    if (p === '/v2/player/stats') return Response.json({users:[]});
    throw new Error('unexpected fixture URL');
  };
}
function ids() { return db().prepare("SELECT external_id FROM ownerships WHERE platform='xbox' ORDER BY external_id").all().map(x=>x.external_id); }
test('incomplete achievements fallback retains missing entries and imports new ones', async () => {
  reset(); responses({titles:[]}, {titles:[game('1'),game('3')]});
  await syncXbox();
  assert.deepEqual(ids(), ['1','2','3']);
});
test('authoritative title history prunes missing entries', async () => {
  reset(); responses({titles:[game('1'),game('3')]}, null);
  await syncXbox(); assert.deepEqual(ids(), ['1','3']);
});
test('title history preserves existing title with an unrecognized type', async () => {
  reset(); responses({titles:[game('1'), {titleId:'2', name:'Game 2'}, game('3')]}, null);
  await syncXbox(); assert.deepEqual(ids(), ['1','2','3']);
});
test('title history with missing title ID does not prune', async () => {
  reset(); responses({titles:[game('1'), {name:'Game 2',type:'Game'}, game('3')]}, null);
  await syncXbox(); assert.deepEqual(ids(), ['1','2','3']);
});
test('failed fallback keeps existing entries', async () => {
  reset(); responses({titles:[]}, new Error('offline'));
  await assert.rejects(syncXbox()); assert.deepEqual(ids(), ['1','2']);
});
test('truncated fallback keeps existing entries', async () => {
  reset(); responses({titles:[]}, {titles:[game('3')], pagingInfo:{continuationToken:'more'}});
  await assert.rejects(syncXbox()); assert.deepEqual(ids(), ['1','2']);
});

// Verpackungsvarianten der OpenXBL-Antwort
const wrapped = {
  'code/content object': {code:200, content:{xuid:'123', titles:[game('1'),game('3')]}},
  'content as JSON text': {code:200, content:JSON.stringify({xuid:'123', titles:[game('1'),game('3')]})},
  'single-item list wrapper': {code:200, content:[{xuid:'123', titles:[game('1'),game('3')]}]},
  'list of JSON texts': {code:200, content:[JSON.stringify({xuid:'123', titles:[game('1'),game('3')]})]},
  'double-encoded JSON text': {code:200, content:JSON.stringify(JSON.stringify({titles:[game('1'),game('3')]}))},
  'titles as JSON texts': {code:200, content:{titles:[JSON.stringify(game('1')), JSON.stringify(game('3'))]}},
};
for (const [name, body] of Object.entries(wrapped)) {
  test(`unwraps ${name}`, async () => {
    reset(); responses(body, null);
    await syncXbox(); assert.deepEqual(ids(), ['1','3']);
  });
}
test.after(() => { db().close(); fs.rmSync(dir, {recursive:true, force:true}); });
