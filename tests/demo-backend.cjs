const fs = require("node:fs");
const ts = require("typescript");
const test = require("node:test");
const assert = require("node:assert/strict");
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { demoApi, resetDemo } = require("../src/lib/demo-backend.ts");
test("demo persists changes, searches the library and resets", () => {
  const store = new Map(); global.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  resetDemo(); const initial = demoApi("/api/library"); assert.equal(initial.games.length, 25);
  const id = initial.games[0].id;
  demoApi(`/api/games/${id}`, { method: "PATCH", body: { completed: true, userNote: "Test", userRating: 4, sessionPref: "short" } });
  demoApi(`/api/games/${id}/feedback`, { body: { minutes: 30, value: 1 } });
  const saved = JSON.parse([...store.values()][0]); assert.equal(saved.games[0].completed, true); assert.equal(saved.games[0].timeFeedback.short, 1);
  assert.equal(demoApi("/api/check?q=The%20Witcher%203%3A%20Wild%20Hunt").exact.length, 1);
  demoApi("/api/games", { body: { title: "Testspiel", platform: "switch", playtimeHours: 2 } }); assert.equal(demoApi("/api/library").games.length, 26);
  assert.equal(demoApi("/api/stats/year").games.length, 26);
  resetDemo(); assert.equal(demoApi("/api/library").games.length, 25); assert.equal(demoApi("/api/library").games[0].completed, false);
});
test("demo runs without localStorage", () => { global.localStorage = { getItem() { throw Error(); }, setItem() { throw Error(); } }; resetDemo(); demoApi("/api/games/1", { method: "PATCH", body: { completed: true } }); assert.equal(demoApi("/api/library").games[0].completed, true); });
