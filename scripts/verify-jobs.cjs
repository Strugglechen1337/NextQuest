/* Standalone smoke check. All writes/network fixtures are confined to a temp DATA_DIR. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextquest-standalone-jobs-'));
const preload = path.join(dir, 'network.cjs');
fs.writeFileSync(preload, `global.fetch = async (url) => {
  if (!String(url).startsWith('https://store.steampowered.com/api/appdetails?')) throw new Error('Unexpected fixture URL');
  await new Promise(r => setTimeout(r, 3500));
  const id = new URL(url).searchParams.get('appids');
  return Response.json({ [id]: { success: true, data: { short_description: 'Deutscher Fixture-Text' } } });
};`);
let child;
let port;
let output = '';
const delay = ms => new Promise(r => setTimeout(r, ms));
function request(route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method: body ? 'POST' : 'GET', agent: false,
      headers: { 'content-type': 'application/json', connection: 'close' } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        res.destroy(); req.destroy();
        if (res.statusCode !== 200) return reject(new Error(`${res.statusCode}: ${data}`));
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
async function start() {
  const net = require('node:net');
  const reservation = net.createServer();
  await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  port = reservation.address().port;
  await new Promise(r => reservation.close(r));
  child = spawn(process.execPath, ['--require', preload, '.next/standalone/server.js'], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true,
    env: { ...process.env, APP_PASSWORD: '', DATA_DIR: dir, HOSTNAME: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  for (let i = 0; i < 100; i++) {
    try { await request('/api/health'); return; } catch { await delay(100); }
  }
  throw new Error(`Standalone did not start: ${output}`);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(r => child.once('exit', r));
  child.kill(); await exited;
}
async function main() {
  try {
    await start();
    await request('/api/settings', { 'auto.enabled': '0' });
    await request('/api/demo', {});
    const fixture = new DatabaseSync(path.join(dir, 'nextquest.db'));
    // Demo IDs are intentionally synthetic. Give two demo entries numeric Steam
    // IDs in this disposable database so the real batch performs delayed fetches.
    fixture.prepare("UPDATE ownerships SET external_id='999' || id WHERE id IN (SELECT id FROM ownerships WHERE platform='steam' LIMIT 2)").run();
    const schema = fixture.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all();
    fixture.close();
    const job = await request('/api/jobs', { kind: 'descriptions' });
    // request() closes its socket. No poll or open client connection for two seconds.
    await delay(2000);
    const running = await request('/api/jobs');
    assert.equal(running.running.id, job.id);
    assert.equal(running.running.step, 'Deutsche Beschreibungen');
    await delay(6500);
    const end = await request('/api/jobs');
    assert.equal(end.running, null);
    assert.equal(end.last.id, job.id);
    assert.ok(end.last.endedAt);
    assert.ok(end.last.done > 0);
    assert.deepEqual(end.last.errors, {});
    await stop();
    await start();
    const restarted = await request('/api/jobs');
    assert.equal(restarted.last.id, job.id);
    assert.equal(restarted.auto.enabled, false);
    const verify = new DatabaseSync(path.join(dir, 'nextquest.db'));
    assert.deepEqual(verify.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all(), schema);
    verify.close();
    console.log(JSON.stringify({ connectionClosed: true, after2Seconds: running.running, after8Seconds: end.last, persistedAfterRestart: true, schemaUnchanged: true }, null, 2));
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e, output); process.exitCode = 1; });
