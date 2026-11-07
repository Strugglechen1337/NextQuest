const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const realLoad = Module._load;
Module._load = function (name, parent, main) {
  if (name === "server-only") return {};
  if (name === "next/server") return { connection: async () => {} };
  if (name.startsWith("@/")) {
    const resolved = path.join(__dirname, "../src", name.slice(2));
    return realLoad.call(this, resolved, parent, main);
  }
  return realLoad.call(this, name, parent, main);
};

require.extensions[".ts"] = function (mod, filename) {
  const source = fs.readFileSync(filename, "utf8");
  mod._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};

const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "nextquest-goals-year-"));
process.env.DATA_DIR = dir;

const { db } = require("../src/lib/db.ts");
const { upsertOwnership, listGames, setCompleted } = require("../src/lib/library.ts");
const { getSetting, publicSettings, SETTING_KEYS } = require("../src/lib/settings.ts");
const {
  validateGoalInput,
  validateGoalsJson,
  parseGoals,
  evaluateGoal,
  evaluateAllGoals,
  countPileOfShame,
} = require("../src/lib/goals.ts");
const { computeYearReview } = require("../src/lib/year-review.ts");
const {
  isAllowedCoverUrl,
  getShareImageDimensions,
  coverInitials,
  fetchGameCoverDataUrl,
} = require("../src/lib/share-image.ts");
const { POST: postGoals, DELETE: deleteGoals, GET: getGoals } = require("../src/app/api/goals/route.ts");

function makeGame(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    title: overrides.title ?? "Test Game",
    igdbId: overrides.igdbId ?? null,
    coverUrl: overrides.coverUrl ?? "https://example.com/cover.jpg",
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
    completedAt: "completedAt" in overrides ? overrides.completedAt : null,
    createdAt: "createdAt" in overrides ? overrides.createdAt : "2026-01-15 10:00:00",
    status: overrides.status ?? (overrides.completed ? "completed" : "open"),
    enrichState: overrides.enrichState ?? "done",
    ownerships: overrides.ownerships ?? [
      {
        id: 1,
        platform: overrides.platform ?? "steam",
        externalId: String(overrides.id ?? 1),
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

test("goals validation accepts valid goal types, generates German titles, and rejects invalid inputs", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");

  const gMonth = validateGoalInput(
    {
      id: "g-month",
      kind: "complete_count",
      period: "month",
      targetCount: 2,
      startDate: "2026-11-01",
      deadline: "2026-11-30",
    },
    now,
  );
  assert.equal(gMonth.title, "Diesen Monat 2 Spiele durchspielen");
  assert.equal(gMonth.targetCount, 2);

  const gPile = validateGoalInput(
    {
      id: "g-pile",
      kind: "reduce_pile",
      targetCount: 3,
      baselinePileCount: 10,
      startDate: "2026-11-01",
      deadline: "2026-12-31",
    },
    now,
  );
  assert.equal(gPile.title, "Pile of Shame um 3 Spiele verkleinern");
  assert.equal(gPile.baselinePileCount, 10);

  const gSpecific = validateGoalInput(
    {
      id: "g-game",
      kind: "complete_game",
      gameId: 42,
      gameTitle: "Hades",
      startDate: "2026-11-01",
      deadline: "2026-12-24",
    },
    now,
  );
  assert.equal(gSpecific.title, "„Hades“ bis 24.12.2026 durchspielen");
  assert.equal(gSpecific.targetCount, 1);

  assert.throws(() => validateGoalInput({ kind: "invalid", deadline: "2026-12-31" }, now), /Ungültige Ziel-Art/);
  assert.throws(
    () => validateGoalInput({ kind: "complete_count", targetCount: 0, deadline: "2026-12-31" }, now),
    /Ziel-Anzahl/,
  );
  assert.throws(
    () =>
      validateGoalInput(
        { kind: "complete_count", targetCount: 2, startDate: "2026-12-10", deadline: "2026-12-01" },
        now,
      ),
    /Enddatum darf nicht vor dem Startdatum/,
  );
  assert.throws(
    () => validateGoalInput({ kind: "complete_game", deadline: "2026-12-31" }, now),
    /Spiel aus der Bibliothek auswählen/,
  );

  const json = validateGoalsJson([gMonth, gPile, gSpecific], now);
  const parsed = parseGoals(json);
  assert.equal(parsed.length, 3);
});

test("evaluateGoal and evaluateAllGoals compute progress and history (achieved / failed / open)", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  const games = [
    makeGame({
      id: 1,
      title: "Celeste",
      completed: true,
      completedAt: "2026-11-03 18:00:00",
      playtimeMin: 540,
    }),
    makeGame({
      id: 2,
      title: "Portal 2",
      completed: true,
      completedAt: "2026-11-06 20:00:00",
      playtimeMin: 600,
    }),
    makeGame({
      id: 3,
      title: "Hades",
      completed: false,
      playtimeMin: 690,
      ttbNormally: 1380, // 50% story
    }),
    makeGame({
      id: 4,
      title: "Unplayed 1",
      completed: false,
      playtimeMin: 0,
      lastPlayed: null,
    }),
    makeGame({
      id: 5,
      title: "Unplayed 2",
      completed: false,
      playtimeMin: 0,
      lastPlayed: null,
    }),
  ];

  assert.equal(countPileOfShame(games), 2);

  // 1. Diesen Monat 2 Spiele durchspielen -> geschafft (2/2)
  const goalMonthAchieved = validateGoalInput(
    {
      id: "m1",
      kind: "complete_count",
      period: "month",
      targetCount: 2,
      startDate: "2026-11-01",
      deadline: "2026-11-30",
    },
    now,
  );
  const resMonth = evaluateGoal(goalMonthAchieved, games, now);
  assert.equal(resMonth.current, 2);
  assert.equal(resMonth.percent, 100);
  assert.equal(resMonth.status, "achieved");
  assert.equal(resMonth.resultLabel, "✓ geschafft");
  assert.equal(resMonth.isHistory, true);

  // 2. Abgelaufenes Monatsziel Oktober -> verpasst (0/2)
  const goalOctFailed = validateGoalInput(
    {
      id: "m2",
      kind: "complete_count",
      period: "month",
      targetCount: 2,
      startDate: "2026-10-01",
      deadline: "2026-10-31",
    },
    now,
  );
  const resOct = evaluateGoal(goalOctFailed, games, now);
  assert.equal(resOct.current, 0);
  assert.equal(resOct.status, "failed");
  assert.equal(resOct.resultLabel, "✗ verpasst");
  assert.equal(resOct.isHistory, true);

  // 3. Pile of Shame um 3 Spiele verkleinern (Ausgangswert 4, aktuell 2 -> 2/3, offen)
  const goalPileOpen = validateGoalInput(
    {
      id: "p1",
      kind: "reduce_pile",
      targetCount: 3,
      baselinePileCount: 4,
      startDate: "2026-11-01",
      deadline: "2026-12-31",
    },
    now,
  );
  const resPile = evaluateGoal(goalPileOpen, games, now);
  assert.equal(resPile.current, 2);
  assert.equal(resPile.target, 3);
  assert.equal(resPile.percent, 67);
  assert.equal(resPile.status, "open");
  assert.equal(resPile.isHistory, false);

  // 4. Bestimmtes Spiel (Hades) bis Jahresende durchspielen -> offen, zeigt 50 % Story-Fortschritt
  const goalHades = validateGoalInput(
    {
      id: "g1",
      kind: "complete_game",
      gameId: 3,
      gameTitle: "Hades",
      startDate: "2026-11-01",
      deadline: "2026-12-31",
    },
    now,
  );
  const resHades = evaluateGoal(goalHades, games, now);
  assert.equal(resHades.current, 0);
  assert.equal(resHades.percent, 50);
  assert.equal(resHades.status, "open");

  const summary = evaluateAllGoals([goalMonthAchieved, goalOctFailed, goalPileOpen, goalHades], games, now);
  assert.equal(summary.active.length, 2);
  assert.equal(summary.history.length, 2);
});

test("settings key 'goals' and /api/goals persist and delete goals without schema changes", async () => {
  db().exec("DELETE FROM ownerships; DELETE FROM games; DELETE FROM settings");
  assert.ok(SETTING_KEYS.includes("goals"));

  const createRes = await postGoals(
    new Request("http://localhost/api/goals", {
      method: "POST",
      body: JSON.stringify({
        id: "test-goal-1",
        kind: "complete_count",
        period: "year",
        targetCount: 12,
        startDate: "2026-01-01",
        deadline: "2026-12-31",
      }),
    }),
  );
  assert.equal(createRes.status, 200);
  const createdData = await createRes.json();
  assert.equal(createdData.goals.length, 1);
  assert.equal(createdData.goals[0].title, "Dieses Jahr 12 Spiele durchspielen");

  // Stored in settings table under 'goals' and exposed in publicSettings()
  assert.ok(getSetting("goals"));
  assert.ok(publicSettings().goals);

  // Update existing goal
  const updateRes = await postGoals(
    new Request("http://localhost/api/goals", {
      method: "POST",
      body: JSON.stringify({
        id: "test-goal-1",
        kind: "complete_count",
        period: "year",
        targetCount: 15,
        startDate: "2026-01-01",
        deadline: "2026-12-31",
      }),
    }),
  );
  const updatedData = await updateRes.json();
  assert.equal(updatedData.goals.length, 1);
  assert.equal(updatedData.goals[0].targetCount, 15);

  // Delete goal
  const delRes = await deleteGoals(new Request("http://localhost/api/goals?id=test-goal-1", { method: "DELETE" }));
  const delData = await delRes.json();
  assert.equal(delData.goals.length, 0);
  assert.equal(getSetting("goals"), null);

  // Invalid goal returns 400
  const badRes = await postGoals(
    new Request("http://localhost/api/goals", {
      method: "POST",
      body: JSON.stringify({ kind: "complete_game", deadline: "2026-12-31" }),
    }),
  );
  assert.equal(badRes.status, 400);
  const getRes = await getGoals();
  assert.deepEqual(await getRes.json(), { goals: [] });
});

test("computeYearReview calculates snapshot deltas, fallback 'total' mode, longest/shortest completed, top genre/platform", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  const g1 = makeGame({
    id: 1,
    title: "Elden Ring",
    genres: ["Role-playing (RPG)", "Action"],
    playtimeMin: 5400, // 90h
    ttbNormally: 3600,
    completed: true,
    completedAt: "2026-08-14 19:30:00",
    createdAt: "2025-12-01 10:00:00",
    lastPlayed: "2026-08-14T19:30:00.000Z",
    ownerships: [
      {
        id: 1,
        platform: "playstation",
        externalId: "er",
        title: "Elden Ring",
        playtimeMin: 5400,
        lastPlayed: "2026-08-14T19:30:00.000Z",
        source: "demo",
      },
    ],
  });
  const g2 = makeGame({
    id: 2,
    title: "Inside",
    genres: ["Puzzle", "Indie"],
    playtimeMin: 240, // 4h
    ttbNormally: 240,
    completed: true,
    completedAt: "2026-03-10 21:00:00",
    createdAt: "2026-03-01 10:00:00",
    lastPlayed: "2026-03-10T21:00:00.000Z",
    ownerships: [
      {
        id: 2,
        platform: "steam",
        externalId: "in",
        title: "Inside",
        playtimeMin: 240,
        lastPlayed: "2026-03-10T21:00:00.000Z",
        source: "demo",
      },
    ],
  });
  const g3 = makeGame({
    id: 3,
    title: "Hades II",
    genres: ["Roguelike", "Action"],
    playtimeMin: 1200,
    completed: false,
    createdAt: "2026-05-10 10:00:00",
    lastPlayed: "2026-10-05T18:00:00.000Z",
    ownerships: [
      {
        id: 3,
        platform: "steam",
        externalId: "h2",
        title: "Hades II",
        playtimeMin: 1200,
        lastPlayed: "2026-10-05T18:00:00.000Z",
        source: "demo",
      },
    ],
  });

  // Case A: Ohne mehrstufige Snapshots -> playtimeMode === "total" („Gesamt“)
  const reviewTotal = computeYearReview(
    [g1, g2, g3],
    [{ id: 1, game_id: 1, platform: "playstation", taken_at: "2026-08-14 19:30:00", playtime_min: 5400 }],
    2026,
    now,
  );
  assert.equal(reviewTotal.playtimeMode, "total");
  assert.equal(reviewTotal.playtimeMin, 5400 + 240 + 1200);
  assert.equal(reviewTotal.completedGames.length, 2);
  assert.equal(reviewTotal.longestCompleted.game.title, "Elden Ring");
  assert.equal(reviewTotal.shortestCompleted.game.title, "Inside");
  assert.equal(reviewTotal.mostPlayedGame.game.title, "Elden Ring");
  assert.equal(reviewTotal.topPlatform.platform, "playstation");
  assert.equal(reviewTotal.topGenre.genre, "Action");
  assert.equal(reviewTotal.newGamesCount, 2); // Inside & Hades II created in 2026

  // Case B: Mit echten Spielzeit-Schnappschüssen -> playtimeMode === "snapshots" (Zuwächse im Jahr)
  const snapshots = [
    { id: 1, game_id: 1, platform: "playstation", taken_at: "2025-12-30 12:00:00", playtime_min: 5000 },
    { id: 2, game_id: 1, platform: "playstation", taken_at: "2026-08-14 19:30:00", playtime_min: 5400 }, // +400 min in 2026
    { id: 3, game_id: 3, platform: "steam", taken_at: "2026-05-10 12:00:00", playtime_min: 100 },
    { id: 4, game_id: 3, platform: "steam", taken_at: "2026-10-05 18:00:00", playtime_min: 1200 }, // +1100 min in 2026
  ];
  const reviewSnaps = computeYearReview([g1, g2, g3], snapshots, 2026, now);
  assert.equal(reviewSnaps.playtimeMode, "snapshots");
  assert.equal(reviewSnaps.playtimeMin, 1500); // 400 + 1100
  assert.equal(reviewSnaps.mostPlayedGame.game.title, "Hades II");
  assert.equal(reviewSnaps.mostPlayedGame.playtimeMin, 1100);
  assert.equal(reviewSnaps.mostPlayedGame.isSnapshotDelta, true);
  assert.equal(reviewSnaps.topPlatform.platform, "steam");
  assert.equal(reviewSnaps.topPlatform.playtimeMin, 1100);

  // DB integration test: completed_at and created_at exposed by listGames()
  const gid = upsertOwnership({ platform: "steam", externalId: "db-1", title: "DB Test Game", playtimeMin: 60 });
  setCompleted(gid, true);
  const loaded = listGames().find((x) => x.id === gid);
  assert.equal(loaded.completed, true);
  assert.ok(loaded.completedAt);
  assert.ok(loaded.createdAt);
});

test("share-image helpers enforce cover host allowlist, dimensions, and base64 conversion", async () => {
  assert.deepEqual(getShareImageDimensions("story"), { format: "story", width: 1080, height: 1920 });
  assert.deepEqual(getShareImageDimensions("square"), { format: "square", width: 1080, height: 1080 });
  assert.deepEqual(getShareImageDimensions(null), { format: "story", width: 1080, height: 1920 });

  assert.equal(isAllowedCoverUrl("https://shared.steamstatic.com/store_item_assets/steam/apps/620/header.jpg"), true);
  assert.equal(isAllowedCoverUrl("https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.jpg"), true);
  assert.equal(isAllowedCoverUrl("https://store-images.s-microsoft.com/image/apps.123.jpg"), true);
  assert.equal(isAllowedCoverUrl("http://127.0.0.1:3000/secret.png"), false);
  assert.equal(isAllowedCoverUrl("https://evil.example.com/shared.steamstatic.com.jpg"), false);
  assert.equal(isAllowedCoverUrl("file:///etc/passwd"), false);
  assert.equal(coverInitials("The Witcher 3"), "TW");

  const origFetch = global.fetch;
  try {
    const fakeJpeg = new Uint8Array(400).fill(42);
    global.fetch = async () =>
      new Response(fakeJpeg, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    const dataUrl = await fetchGameCoverDataUrl(
      makeGame({ coverUrl: "https://shared.steamstatic.com/store_item_assets/steam/apps/620/header.jpg" }),
    );
    assert.ok(dataUrl && dataUrl.startsWith("data:image/jpeg;base64,"));

    const blocked = await fetchGameCoverDataUrl(makeGame({ coverUrl: "https://untrusted.example.com/a.jpg" }));
    assert.equal(blocked, null);
  } finally {
    global.fetch = origFetch;
  }
});

test.after(() => {
  db().close();
  fs.rmSync(dir, { recursive: true, force: true });
});
