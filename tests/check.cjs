const fs = require("node:fs");
const assert = require("node:assert/strict");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { parseStoreInput, matchGames } = require("../src/lib/check.ts");
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const game = (title, platform, externalId) => ({ title, igdbId: 42, ownerships: [{ title, platform, externalId }] });
test("erkennt Store-Links und lehnt fremde Hosts ab", () => {
  assert.equal(parseStoreInput("https://store.steampowered.com/app/123/game").id, "123");
  assert.equal(parseStoreInput("https://www.xbox.com/de-de/games/store/foo/BWVBNCMF22ZK").id, "BWVBNCMF22ZK");
  assert.equal(parseStoreInput("https://store.playstation.com/de-de/concept/123").id, "concept:123");
  assert.equal(parseStoreInput("https://www.gog.com/de/game/the_witcher_3").title, "the witcher 3");
  assert.equal(parseStoreInput("https://store.epicgames.com/de/p/alan-wake-2").title, "alan wake 2");
  assert.equal(parseStoreInput("https://store.steampowered.com.evil.test/app/123").platform, undefined);
});
test("gleicht IDs, römische Zahlen und ähnliche Titel ab", () => {
  const games = [game("Portal II", "steam", "620"), game("Portal 2: Extra", "gog", "p2")];
  assert.equal(matchGames(games, { title: "Portal 2" }, norm).exact.length, 1);
  assert.equal(matchGames(games, { title: "Portal 2" }, norm).similar.length, 1);
  assert.equal(matchGames(games, { title: "620", platform: "steam", id: "620" }, norm).exact.length, 1);
  assert.equal(matchGames(games, { title: "unrelated" }, norm, 42).exact.length, 2);
});
