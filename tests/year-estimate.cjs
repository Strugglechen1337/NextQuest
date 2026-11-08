const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { estimateYearPlaytime } = require("../src/lib/year-estimate.ts");

test("historical unlocks distribute only the first snapshot baseline", () => {
  const snapshots = [
    { taken_at: "2024-02-01T00:00:00Z", playtime_min: 600 },
    { taken_at: "2024-12-01T00:00:00Z", playtime_min: 720 },
  ];
  const unlocks = [
    { external_id: "a", unlocked_at: "2023-01-01T00:00:00Z" },
    { external_id: "b", unlocked_at: "2024-01-01T00:00:00Z" },
    { external_id: "c", unlocked_at: "2024-03-01T00:00:00Z" },
  ];
  const result = estimateYearPlaytime(2024, 720, snapshots, unlocks);
  assert.equal(result.estimatedMinutes, 300);
  assert.equal(result.measuredMinutes, 120);
  assert.equal(result.minutes, 420);
  assert.equal(result.source, "geschätzt (Erfolge)");
});

test("without snapshots the total is distributed by dated unlocks", () => {
  const result = estimateYearPlaytime(2022, 900, [], [
    { external_id: "a", unlocked_at: "2022-01-01T00:00:00Z" },
    { external_id: "b", unlocked_at: "2023-01-01T00:00:00Z" },
    { external_id: "c", unlocked_at: "2023-02-01T00:00:00Z" },
  ]);
  assert.equal(result.minutes, 300);
  assert.equal(result.source, "geschätzt (Erfolge)");
});

test("no evidence and intervals across New Year remain unknown", () => {
  const result = estimateYearPlaytime(2024, 900, [
    { taken_at: "2023-12-30T00:00:00Z", playtime_min: 800 },
    { taken_at: "2024-01-02T00:00:00Z", playtime_min: 900 },
  ], []);
  assert.equal(result.minutes, 0);
  assert.equal(result.source, "unbekannt");
});
