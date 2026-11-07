const fs = require("node:fs");
const assert = require("node:assert/strict");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function (m, f) {
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    f,
  );
};

const {
  getContinueGames,
  formatLastPlayedDays,
  getStoryProgressPercent,
  computeLibraryStatistics,
} = require("../src/lib/stats.ts");

function makeGame(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    title: overrides.title ?? "Test Game",
    igdbId: overrides.igdbId ?? null,
    coverUrl: overrides.coverUrl ?? null,
    coverFallbacks: overrides.coverFallbacks ?? [],
    rating: overrides.rating ?? 85,
    ratingCount: overrides.ratingCount ?? 500,
    genres: overrides.genres ?? ["Role-playing (RPG)"],
    modes: overrides.modes ?? ["Single player"],
    keywords: overrides.keywords ?? [],
    sessionPref: overrides.sessionPref ?? null,
    ttbHastily: overrides.ttbHastily ?? null,
    ttbNormally: "ttbNormally" in overrides ? overrides.ttbNormally : 600,
    ttbCompletely: overrides.ttbCompletely ?? null,
    releaseYear: overrides.releaseYear ?? 2023,
    summary: overrides.summary ?? null,
    summaryDe: overrides.summaryDe ?? null,
    completed: overrides.completed ?? false,
    enrichState: overrides.enrichState ?? "done",
    ownerships: overrides.ownerships ?? [
      {
        id: 1,
        platform: "steam",
        externalId: "1",
        title: overrides.title ?? "Test Game",
        playtimeMin: overrides.playtimeMin ?? 120,
        lastPlayed: "lastPlayed" in overrides ? overrides.lastPlayed : "2026-10-20T12:00:00.000Z",
        source: "demo",
      },
    ],
    playtimeMin: overrides.playtimeMin ?? 120,
    lastPlayed: "lastPlayed" in overrides ? overrides.lastPlayed : "2026-10-20T12:00:00.000Z",
    copies: overrides.copies ?? 1,
    inGamePass: overrides.inGamePass ?? false,
    owned: overrides.owned ?? true,
  };
}

test("getContinueGames filters completed and unplayed, sorts by lastPlayed desc, caps at 12", () => {
  const games = [];
  for (let i = 1; i <= 15; i++) {
    const day = String(i).padStart(2, "0");
    games.push(
      makeGame({
        id: i,
        title: `Game ${i}`,
        lastPlayed: `2026-10-${day}T10:00:00.000Z`,
        completed: i === 15, // most recent is completed -> excluded
      }),
    );
  }
  games.push(makeGame({ id: 99, title: "Never Played", lastPlayed: null, playtimeMin: 0 }));

  const res = getContinueGames(games);
  assert.equal(res.length, 12);
  assert.equal(res[0].id, 14);
  assert.equal(res[11].id, 3);
  assert.ok(res.every((g) => !g.completed && g.lastPlayed !== null));
});

test("formatLastPlayedDays formats relative German day labels", () => {
  const now = Date.parse("2026-11-07T12:00:00.000Z");
  assert.equal(formatLastPlayedDays(null, now), "");
  assert.equal(formatLastPlayedDays("2026-11-07T08:00:00.000Z", now), "zuletzt heute");
  assert.equal(formatLastPlayedDays("2026-11-06T08:00:00.000Z", now), "zuletzt vor 1 Tag");
  assert.equal(formatLastPlayedDays("2026-10-28T12:00:00.000Z", now), "zuletzt vor 10 Tagen");
});

test("getStoryProgressPercent caps at 99% and hides for multiplayer when playtime > ttbNormally", () => {
  // Known duration, 50%
  assert.equal(getStoryProgressPercent(makeGame({ playtimeMin: 300, ttbNormally: 600 })), 50);

  // Singleplayer with playtime > ttbNormally -> capped at 99%
  assert.equal(
    getStoryProgressPercent(makeGame({ playtimeMin: 900, ttbNormally: 600, modes: ["Single player"] })),
    99,
  );

  // Unknown duration -> null
  assert.equal(getStoryProgressPercent(makeGame({ playtimeMin: 300, ttbNormally: null })), null);

  // Multiplayer with playtime > ttbNormally -> hidden (null)
  assert.equal(
    getStoryProgressPercent(
      makeGame({
        playtimeMin: 1200,
        ttbNormally: 600,
        modes: ["Multiplayer"],
      }),
    ),
    null,
  );

  // Multiplayer with playtime <= ttbNormally -> shown
  assert.equal(
    getStoryProgressPercent(
      makeGame({
        playtimeMin: 300,
        ttbNormally: 600,
        modes: ["Multiplayer"],
      }),
    ),
    50,
  );
});

test("computeLibraryStatistics calculates KPIs, platform playtime, genres, durations, and 12-month activity", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  const g1 = makeGame({
    id: 1,
    title: "Witcher 3",
    genres: ["Role-playing (RPG)", "Open world"],
    playtimeMin: 3000,
    ttbNormally: 3000,
    completed: true,
    copies: 2,
    lastPlayed: "2026-11-02T10:00:00.000Z",
    ownerships: [
      { id: 1, platform: "steam", externalId: "1", title: "Witcher 3", playtimeMin: 2400, lastPlayed: "2026-11-02T10:00:00.000Z", source: "demo" },
      { id: 2, platform: "gog", externalId: "2", title: "Witcher 3", playtimeMin: 600, lastPlayed: null, source: "demo" },
    ],
  });
  const g2 = makeGame({
    id: 2,
    title: "Celeste",
    genres: ["Platform", "Indie"],
    playtimeMin: 0,
    ttbNormally: 480, // 8h (5-15 Std)
    completed: false,
    copies: 1,
    lastPlayed: null,
    ownerships: [
      { id: 3, platform: "steam", externalId: "3", title: "Celeste", playtimeMin: 0, lastPlayed: null, source: "demo" },
    ],
  });
  const g3 = makeGame({
    id: 3,
    title: "Inside",
    genres: ["Puzzle", "Indie"],
    playtimeMin: 60,
    ttbNormally: 240, // 4h (unter 5 Std)
    completed: false,
    copies: 1,
    lastPlayed: "2026-09-15T10:00:00.000Z",
    ownerships: [
      { id: 4, platform: "epic", externalId: "4", title: "Inside", playtimeMin: 60, lastPlayed: "2026-09-15T10:00:00.000Z", source: "demo" },
    ],
  });

  const stats = computeLibraryStatistics([g1, g2, g3], now);

  assert.equal(stats.kpis.total, 3);
  assert.equal(stats.kpis.completed, 1);
  assert.equal(stats.kpis.completionRatePercent, 33);
  assert.equal(stats.kpis.totalPlaytimeMin, 3060);
  assert.equal(stats.kpis.pileOfShameCount, 1); // g2 is open & 0 playtime
  assert.equal(stats.kpis.remainingTtbMin, 720); // g2 (480) + g3 (240)
  assert.equal(stats.kpis.duplicatesCount, 1);
  assert.equal(stats.kpis.extraCopiesCount, 1);

  // Platform playtime
  assert.equal(stats.byPlatform[0].platform, "steam");
  assert.equal(stats.byPlatform[0].playtimeMin, 2400);
  assert.equal(stats.byPlatform[1].platform, "gog");
  assert.equal(stats.byPlatform[1].playtimeMin, 600);
  assert.equal(stats.byPlatform[2].platform, "epic");
  assert.equal(stats.byPlatform[2].playtimeMin, 60);

  // Genres mapped to German categories
  const rollenspiel = stats.byGenre.find((x) => x.genre === "Rollenspiel");
  const indie = stats.byGenre.find((x) => x.genre === "Indie");
  assert.ok(rollenspiel);
  assert.equal(rollenspiel.playtimeMin, 3000);
  assert.ok(indie);
  assert.equal(indie.gameCount, 2);

  // Duration buckets
  const byId = Object.fromEntries(stats.byDuration.map((b) => [b.id, b.count]));
  assert.equal(byId.under5, 1);
  assert.equal(byId["5to15"], 1);
  assert.equal(byId["15to40"], 0);
  assert.equal(byId.over40, 1);

  // Last 12 months activity
  assert.equal(stats.byMonth.length, 12);
  const nov = stats.byMonth.find((m) => m.key === "2026-11");
  const sep = stats.byMonth.find((m) => m.key === "2026-09");
  assert.equal(nov.count, 1);
  assert.equal(sep.count, 1);
});
