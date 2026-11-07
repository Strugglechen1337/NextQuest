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
const { upsertOwnership, mergeGames, listGames } = require('../src/lib/library.ts');
const { setSetting } = require('../src/lib/settings.ts');
const { descriptionsBatch } = require('../src/lib/descriptions.ts');
function reset() { db().exec('DELETE FROM ownerships; DELETE FROM games; DELETE FROM settings'); }
test('Steam decodes HTML, preserves English, and caches successful results', async () => {
  reset();
  const id=upsertOwnership({platform:'steam',externalId:'292030',title:'Witcher'});
  db().prepare('UPDATE games SET summary=? WHERE id=?').run('English original',id);
  let calls=0;
  global.fetch=async url=>{calls++;assert.match(url,/appids=292030&l=german&cc=de&filters=basic/);return Response.json({'292030':{success:true,data:{short_description:'<b>Eine Welt</b> &amp; Gr&uuml;ße &#x2013; &#228;'}}});};
  assert.equal((await descriptionsBatch()).matched,1);
  assert.equal(listGames()[0].summaryDe,'Eine Welt & Grüße – ä');
  assert.equal(listGames()[0].summary,'English original');
  await descriptionsBatch();assert.equal(calls,1);
});
test('429 retains saved texts and pending games, cooldown avoids requests, resume works', async()=>{
  reset();
  const a=upsertOwnership({platform:'steam',externalId:'1',title:'A'});
  const b=upsertOwnership({platform:'steam',externalId:'2',title:'B'});
  global.fetch=async url=>url.includes('appids=1&')?Response.json({'1':{success:true,data:{short_description:'Ein Abenteuer'}}}):new Response('',{status:429});
  const r=await descriptionsBatch();assert.equal(r.rateLimited,true);assert.equal(r.processed,1);assert.equal(r.remaining,1);
  assert.equal(db().prepare('SELECT summary_de FROM games WHERE id=?').get(a).summary_de,'Ein Abenteuer');
  assert.equal(db().prepare('SELECT summary_de_state FROM games WHERE id=?').get(b).summary_de_state,null);
  global.fetch=async()=>{throw Error('cooldown must avoid requests');};
  assert.equal((await descriptionsBatch()).rateLimited,true);
  setSetting('descriptions.steamRetryAt',null);
  global.fetch=async()=>Response.json({'2':{success:true,data:{short_description:'Zweites Abenteuer'}}});
  assert.equal((await descriptionsBatch()).remaining,0);
});
test('reverse IGDB mapping finds Steam description for GOG ownership',async()=>{
  reset();const id=upsertOwnership({platform:'gog',externalId:'77',title:'Other'});
  db().prepare('UPDATE games SET igdb_id=42 WHERE id=?').run(id);
  for(const [key,value] of Object.entries({'igdb.clientId':'fixture','igdb.clientSecret':'fixture','igdb.token':'fixture','igdb.tokenExpires':String(Date.now()+3600000)}))setSetting(key,value);
  global.fetch=async(url,options)=>{
    if(url.includes('external_games')){assert.match(options.body,/game = \(42\)/);return Response.json([{game:42,uid:'99'}]);}
    assert.match(url,/appids=99&/);return Response.json({'99':{success:true,data:{short_description:'Deutscher Text'}}});
  };
  assert.equal((await descriptionsBatch()).matched,1);
});
test('Microsoft batches products, truncates long description, and retries missing games after new source',async()=>{
  reset();upsertOwnership({platform:'gamepass',externalId:'9AAAAAAA0001',title:'A'});
  upsertOwnership({platform:'gamepass',externalId:'9AAAAAAA0002',title:'B'});
  const absent=upsertOwnership({platform:'gamepass',externalId:'9AAAAAAA0003',title:'C'});
  let calls=0;
  global.fetch=async url=>{calls++;assert.match(url,/market=DE&languages=de-de/);return Response.json({Products:[
    {ProductId:'9AAAAAAA0001',LocalizedProperties:[{ShortDescription:'<p>Deutsches Spiel</p>'}]},
    {ProductId:'9AAAAAAA0002',LocalizedProperties:[{ProductDescription:'Eine Welt '.repeat(100)}]},
  ]});};
  assert.equal((await descriptionsBatch()).matched,2);
  assert.equal(listGames().find(g=>g.title==='B').summaryDe.length,698);
  await descriptionsBatch();assert.equal(calls,1);
  db().prepare("INSERT INTO ownerships(game_id,platform,external_id,title) VALUES (?,'steam','123','C')").run(absent);
  global.fetch=async()=>Response.json({'123':{success:true,data:{short_description:'Jetzt verfügbar'}}});
  assert.equal((await descriptionsBatch()).matched,1);
});
test('merge transfers source German text and keeps populated target',()=>{
  reset();const a=upsertOwnership({platform:'steam',externalId:'1',title:'A'});
  const b=upsertOwnership({platform:'steam',externalId:'2',title:'B'});
  db().prepare('UPDATE games SET summary_de=? WHERE id=?').run('Deutsch',a);
  mergeGames(a,b);assert.equal(listGames()[0].summaryDe,'Deutsch');
  const c=upsertOwnership({platform:'steam',externalId:'3',title:'C'});
  db().prepare('UPDATE games SET summary_de=? WHERE id=?').run('Anderer Text',c);
  mergeGames(c,b);assert.equal(listGames()[0].summaryDe,'Deutsch');
});
test.after(()=>{db().close();fs.rmSync(dir,{recursive:true,force:true});});
