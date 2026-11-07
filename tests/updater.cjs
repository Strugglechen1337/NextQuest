const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(name, ...args) { return name === "server-only" ? {} : originalLoad.call(this, name, ...args); };
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, f);
const updater = require("../src/lib/updater.ts");
const sha = n => String(n).repeat(40);
test("Versionen, unbekannte Version und GitHub-Fehler", async () => {
  let calls = 0;
  global.fetch = async url => { calls++; return { ok: true, json: async () => url.includes("compare/") ? { ahead_by: 1, behind_by: 0, commits: [{ sha: sha(2), commit: { message: "Neu\nDetails", author: { date: "2026" } } }] } : { sha: sha(2) } }; };
  const newer = await updater.versions(sha(1));
  assert.equal(newer.available, true); assert.equal(newer.behindBy, 1); assert.equal(newer.changes[0].message, "Neu");
  await updater.versions(sha(1)); assert.equal(calls, 2);
  assert.equal((await updater.versions(sha(2))).behindBy, 0);
  assert.equal((await updater.versions("dev")).behindBy, null);
  global.fetch = async () => ({ ok: false });
  assert.equal((await updater.versions(sha(3))).error, "Prüfung gerade nicht möglich");
});
test("Status und einmalige Anfrage", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nq-update-")); process.env.NEXTQUEST_UPDATE_DIR = dir;
  try {
    fs.writeFileSync(path.join(dir, "status.json"), "{"); assert.equal(await updater.readStatus(dir), null);
    fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify({ state: "running" }));
    assert.equal((await updater.readStatus(dir)).log.length, 0);
    await assert.rejects(updater.requestUpdate());
    fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify({ state: "idle" }));
    const results = await Promise.allSettled([updater.requestUpdate(), updater.requestUpdate()]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "request.json"))).source, "manual");
    process.env.NEXTQUEST_UPDATE_DIR = path.join(dir, "missing"); assert.equal(await updater.updateDirectory(), null); await assert.rejects(updater.requestUpdate());
  } finally { delete process.env.NEXTQUEST_UPDATE_DIR; fs.rmSync(dir, { recursive: true, force: true }); }
});
test("API speichert den Automatik-Schalter als 1 und 0", async () => {
  const values = new Map();
  const previous = Module._load;
  Module._load = function(name, ...args) {
    if (name === "next/server") return { connection: async () => {} };
    if (name === "@/lib/settings") return { getSetting: key => values.get(key) ?? null, setSetting: (key, value) => values.set(key, value) };
    if (name === "@/lib/updater") return updater;
    return previous.call(this, name, ...args);
  };
  try {
    const route = require("../src/app/api/update/route.ts");
    for (const [input, expected] of [[true, "1"], [false, "0"]]) {
      const response = await route.POST(new Request("http://localhost/api/update", { method: "POST", body: JSON.stringify({ auto: input }) }));
      assert.equal(response.status, 200); assert.equal(values.get("update.auto"), expected);
    }
    const invalid = await route.POST(new Request("http://localhost/api/update", { method: "POST", body: JSON.stringify({ auto: "1" }) }));
    assert.equal(invalid.status, 400);
  } finally { Module._load = previous; }
});
