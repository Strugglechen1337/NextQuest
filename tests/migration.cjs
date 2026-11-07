 
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const {DatabaseSync} = require('node:sqlite');
const realLoad=Module._load;
Module._load=function(n,p,m){return n==='server-only'?{}:realLoad.call(this,n,p,m)};
require.extensions['.ts']=function(m,f){m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f)};
const dir=fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(),'nextquest-migration-'));
process.env.DATA_DIR=dir;
const dbfile=path.join(dir,'nextquest.db');
const fixture=new DatabaseSync(dbfile);
// The original schema without any additive migration; populated metadata and
// credentials make accidental rewrites visible, alongside ownership/playtime.
const originalSchema = fs.readFileSync(path.join(__dirname,'../src/lib/db.ts'),'utf8').match(/const SCHEMA = `([\s\S]*?)`;/)[1];
fixture.exec(originalSchema.replace(/CREATE TABLE IF NOT EXISTS playtime_snapshots[\s\S]*/, ''));
fixture.exec("INSERT INTO games(id,title,norm_title,igdb_id,summary,completed,enrich_state,rating,genres) VALUES(1,'fixture','fixture',42,'English description',1,'done',88,'[\"RPG\"]'); INSERT INTO settings VALUES('fixture','retained-secret'); INSERT INTO ownerships(game_id,platform,external_id,title,playtime_min,last_played) VALUES(1,'steam','292030','fixture ownership',1234,'2026-01-01');");
const snapshot = Object.fromEntries(['games','ownerships','settings'].map(t=>[t,fixture.prepare('SELECT * FROM '+t).all()]));
fixture.close();
const {db,tx}=require('../src/lib/db.ts');
let d=db();
for (const table of ['playtime_snapshots','suggestion_feedback','steam_tags','steam_tag_checks']) assert(d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
const cols=d.prepare('PRAGMA table_info(games)').all().map(c=>c.name);
assert(['status','user_note','user_rating'].every(c=>cols.includes(c)));
assert(['achievements_earned','achievements_total','progress_pct','leaving_soon'].every(c=>d.prepare('PRAGMA table_info(ownerships)').all().some(x=>x.name===c)));
assert(cols.includes('keywords') && cols.includes('session_pref'));
assert(cols.includes('summary_de') && cols.includes('summary_de_state'));
for (const [table, rows] of Object.entries(snapshot)) {
  const names=Object.keys(rows[0]).join(',');
  assert.deepEqual(d.prepare('SELECT '+names+' FROM '+table).all(),rows);
}
assert.equal(d.prepare('SELECT summary_de,summary_de_state FROM games').get().summary_de,null);
// Reopen the module to exercise the migration a second time.
d.close(); delete global.__nextquestDb; delete require.cache[require.resolve('../src/lib/db.ts')];
const reopened = require('../src/lib/db.ts').db(); d=reopened;
assert.deepEqual(reopened.prepare('PRAGMA table_info(games)').all().map(c=>c.name),cols);

assert.equal(d.prepare('SELECT count(*) AS n FROM games').get().n,1);
assert.throws(()=>tx(()=>{d.prepare("INSERT INTO games (title,norm_title) VALUES ('rollback','rollback')").run();throw Error('fixture');}));
assert.equal(d.prepare('SELECT count(*) AS n FROM games').get().n,1);
assert.equal(d.prepare('PRAGMA quick_check').get().quick_check,'ok');
d.close(); fs.rmSync(dir,{recursive:true,force:true});
console.log('additive migration, retained fixture row, transaction rollback and quick_check: ok');
