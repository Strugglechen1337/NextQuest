 
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
const { upsertOwnership, listGames, setCompleted, setGameStatus, setUserReview, mergeGames } = require('../src/lib/library.ts');
const { xboxProgress, psnProgress, steamProgress } = require('../src/lib/achievement-progress.ts');
const { fetchLeavingSoon, LEAVING_CATALOGS } = require('../src/lib/gamepass-leaving.ts');
const { setSetting } = require('../src/lib/settings.ts');
const { syncXbox } = require('../src/lib/xbox.ts');
const { syncSteam } = require('../src/lib/steam.ts');
const { syncPlayStation } = require('../src/lib/playstation.ts');
const { syncGamePass } = require('../src/lib/gamepass.ts');
const { isCandidate, suggestForTime } = require('../src/lib/suggest.ts');
const reset = () => db().exec('DELETE FROM ownerships; DELETE FROM games; DELETE FROM settings');
test('status/completed and merge preserve journal and explicit target fields', () => {
 reset(); const a=upsertOwnership({platform:'steam',externalId:'a',title:'A'}), b=upsertOwnership({platform:'xbox',externalId:'b',title:'B'});
 db().prepare('UPDATE games SET completed=1 WHERE id=?').run(a);
 assert.equal(listGames().find(g=>g.id===a).status,'completed');
 for(const status of ['open','wanted','playing','paused','abandoned','completed']) { setGameStatus(a,status); const g=listGames().find(g=>g.id===a); assert.equal(g.status,status); assert.equal(g.completed,status==='completed'); }
 setCompleted(a,false); assert.equal(listGames().find(g=>g.id===a).status,'open');
 setGameStatus(a,'playing'); setUserReview(a,'Keep me',4); mergeGames(a,b);
 let g=listGames()[0]; assert.equal(g.status,'playing'); assert.equal(g.userNote,'Keep me'); assert.equal(g.userRating,4);
 const c=upsertOwnership({platform:'steam',externalId:'c',title:'C'}); setGameStatus(c,'abandoned'); setUserReview(c,'Other',1); mergeGames(c,b);
 g=listGames()[0]; assert.equal(g.status,'playing'); assert.equal(g.userNote,'Keep me'); assert.equal(g.userRating,4);
 assert.throws(()=>setGameStatus(b,'invalid')); assert.throws(()=>setUserReview(b,'bad',6)); assert.equal(listGames()[0].userNote,'Keep me');
 assert.equal(isCandidate({...g,status:'abandoned'},true),false);
});
test('Xbox title history persists achievements from mocked response', async () => {
 reset(); setSetting('xbox.apiKey','fixture'); setSetting('xbox.xuid','123');
 global.fetch=async url=>String(url).includes('titleHistory') ? Response.json({titles:[{titleId:'1',name:'Xbox test',type:'Game',achievement:{currentAchievements:3,totalAchievements:10}}]}) : Response.json({statlistscollection:[]});
 await syncXbox(); assert.equal(listGames()[0].ownerships[0].progressPct,30);
});
test('progress parsers tolerate unavailable and malformed data', () => {
 assert.deepEqual(xboxProgress({achievement:{currentAchievements:2,totalAchievements:8}}),{achievementsEarned:2,achievementsTotal:8,progressPct:25});
 assert.equal(xboxProgress({achievement:{currentGamerscore:30,totalGamerscore:100}}).progressPct,30);
 assert.equal(xboxProgress({achievement:{progressPercentage:40}}).progressPct,40);
 assert.equal(psnProgress({progress:21}).progressPct,21);
 assert.equal(psnProgress({earnedTrophies:{bronze:1,silver:1,gold:0,platinum:0},definedTrophies:{bronze:4,silver:4,gold:1,platinum:1}}).progressPct,20);
 assert.equal(steamProgress({playerstats:{success:true,achievements:[{achieved:1},{achieved:0}]}}).progressPct,50);
 for(const parse of [xboxProgress,psnProgress,steamProgress]) assert.equal(parse(null).progressPct,undefined);
 assert.deepEqual(steamProgress({playerstats:{success:false}}),{});
});
test('Steam fetches at most 50 recent achievements and tolerates private failures', async () => {
 reset(); setSetting('steam.apiKey','fixture'); setSetting('steam.steamId','123'); let calls=0;
 const now=Math.floor(Date.now()/1000);
 global.fetch=async url=> { if(String(url).includes('GetOwnedGames')) return Response.json({response:{games:Array.from({length:55},(_,i)=>({appid:i+1,name:'Steam '+i,playtime_forever:1,rtime_last_played:i===54?now-100*86400:now-i}))}}); calls++; if(calls===2) throw Error('private'); return Response.json({playerstats:{success:true,achievements:[{achieved:1},{achieved:0}]}}); };
 await syncSteam(); assert.equal(calls,50); assert.equal(listGames().length,55); assert.equal(listGames().find(g=>g.title==='Steam 0').ownerships[0].progressPct,50);
});
test('PSN optional paged trophies provide progress without changing ownership', async () => {
 reset(); setSetting('psn.accessToken','fixture'); setSetting('psn.accessExpires','2099-01-01'); setSetting('psn.onlineId','fixture');
 global.fetch=async url=> String(url).includes('gamelist') ? Response.json({titles:[{titleId:'CUSA1',name:'Test PSN',category:'ps4_game'}]}) : Response.json({trophyTitles:[{trophyTitleName:'Test PSN',progress:37}]});
 await syncPlayStation(); assert.equal(listGames()[0].ownerships[0].progressPct,37);
 global.fetch=async url=> String(url).includes('gamelist') ? Response.json({titles:[{titleId:'CUSA1',name:'Test PSN',category:'ps4_game'}]}) : new Response('',{status:403});
 await syncPlayStation(); assert.equal(listGames()[0].ownerships[0].progressPct,37);
});
test('leaving soon is optional, scoped to Game Pass, and unavailable lists never delete ownership', async () => {
 reset(); setSetting('gamepass.enabled','1'); setSetting('gamepass.catalogs','pc,console'); const id='ABCDEFGHIJKL';
 global.fetch=async url=> String(url).includes('displaycatalog') ? Response.json({Products:[{ProductId:id,LocalizedProperties:[{ProductTitle:'Pass test',Images:[]}]}]}) : Response.json([{id}]);
 await syncGamePass(); let g=listGames()[0]; assert.equal(g.ownerships[0].leavingSoon,true);
 assert(suggestForTime([g],60,true)[0].reasons.includes('Verlässt bald den Game Pass'));
 upsertOwnership({platform:'steam',externalId:'z',title:'Other',leavingSoon:true}); assert.equal(listGames().find(g=>g.title==='Other').ownerships[0].leavingSoon,false);
 global.fetch=async url=> String(url).includes('displaycatalog') ? Response.json({Products:[{ProductId:id,LocalizedProperties:[{ProductTitle:'Pass test',Images:[]}]}]}) : Object.values(LEAVING_CATALOGS).some(c=>String(url).includes(c)) ? new Response('',{status:503}) : Response.json([{id}]);
 await syncGamePass(); g=listGames().find(g=>g.title==='Pass test'); assert.equal(g.ownerships[0].leavingSoon,true); assert.equal(listGames().length,2);
 assert.equal(await fetchLeavingSoon(['pc'],'DE'),null);
 global.fetch=async()=>Response.json([{siglId:'metadata'}]); assert.deepEqual(await fetchLeavingSoon(['pc'],'DE'),new Set());
});
test.after(()=>{ db().close(); fs.rmSync(dir,{recursive:true,force:true}); });
