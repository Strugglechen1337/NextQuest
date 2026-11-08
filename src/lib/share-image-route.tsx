import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { listGames } from "@/lib/library";
import {
  coverHue,
  coverInitials,
  fetchGameCoverDataUrl,
  getShareImageDimensions,
} from "@/lib/share-image";
import { formatMinutes } from "@/lib/suggest";
import { computeYearReview, type PlaytimeSnapshotRow, type AchievementUnlockRow } from "@/lib/year-review";

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const formatParam = url.searchParams.get("format");
  const skipCovers = url.searchParams.get("nocovers") === "1";

  const requestedYear = yearParam ? Number(yearParam) : undefined;
  const { format, width, height } = getShareImageDimensions(formatParam);
  const isStory = format === "story";

  const games = listGames();
  const snapshots = db()
    .prepare("SELECT id, game_id, platform, taken_at, playtime_min FROM playtime_snapshots ORDER BY id ASC")
    .all() as unknown as PlaytimeSnapshotRow[];
  const unlocks = db().prepare("SELECT game_id, platform, external_id, unlocked_at FROM achievement_unlocks").all() as unknown as AchievementUnlockRow[];

  const review = computeYearReview(
    games,
    snapshots,
    requestedYear && Number.isInteger(requestedYear) ? requestedYear : undefined,
    new Date(), unlocks,
  );

  const collageTargetCount = isStory ? 6 : 4;
  const collageItems = review.collageGames.slice(0, collageTargetCount);

  const coverMap = new Map<number, string | null>();
  if (!skipCovers) {
    const toFetch = new Map<number, (typeof games)[number]>();
    for (const g of collageItems) toFetch.set(g.id, g);
    if (review.mostPlayedGame) toFetch.set(review.mostPlayedGame.game.id, review.mostPlayedGame.game);
    await Promise.all(
      [...toFetch.values()].map(async (g) => {
        const dataUrl = await fetchGameCoverDataUrl(g);
        coverMap.set(g.id, dataUrl);
      }),
    );
  }

  const playtimeTitle = `Spielzeit ${review.year}`;
  const playtimeSub = review.playtimeSource;

  const mostPlayed = review.mostPlayedGame;
  const mostPlayedCover = mostPlayed ? (coverMap.get(mostPlayed.game.id) ?? null) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: isStory ? "64px 60px" : "44px 52px",
          background: "linear-gradient(155deg, #17112b 0%, #0b0d14 48%, #091f1b 100%)",
          color: "#f3f4f6",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Dekorative Hintergrund-Lichter */}
        <div
          style={{
            position: "absolute",
            top: -180,
            right: -140,
            width: 560,
            height: 560,
            borderRadius: 9999,
            background: "radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0) 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -180,
            left: -140,
            width: 560,
            height: 560,
            borderRadius: 9999,
            background: "radial-gradient(circle, rgba(52,211,153,0.25) 0%, rgba(52,211,153,0) 70%)",
            display: "flex",
          }}
        />

        {/* 1. Kopfbereich: NextQuest Branding + Jahr */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: isStory ? 18 : 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  width: isStory ? 68 : 54,
                  height: isStory ? 68 : 54,
                  borderRadius: 18,
                  background: "linear-gradient(135deg, #8b5cf6 0%, #34d399 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0b0d14",
                  fontSize: isStory ? 32 : 26,
                  fontWeight: 900,
                }}
              >
                NQ
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: isStory ? 34 : 28,
                    fontWeight: 800,
                    letterSpacing: -0.5,
                    color: "#ffffff",
                  }}
                >
                  NextQuest
                </span>
                <span
                  style={{
                    fontSize: isStory ? 18 : 15,
                    color: "#a78bfa",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 2,
                  }}
                >
                  Wrapped · Jahresrückblick
                </span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: isStory ? "12px 28px" : "8px 22px",
                borderRadius: 999,
                background: "linear-gradient(90deg, #8b5cf6 0%, #34d399 100%)",
                color: "#0b0d14",
                fontSize: isStory ? 34 : 26,
                fontWeight: 900,
              }}
            >
              {String(review.year)}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: isStory ? 62 : 42,
              fontWeight: 900,
              letterSpacing: -1.5,
              color: "#ffffff",
              marginTop: isStory ? 8 : 2,
            }}
          >
            {`Mein Spieljahr ${review.year}`}
          </div>
        </div>

        {/* 2. Große Kennzahlen (2x2 Kacheln) */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: isStory ? 22 : 16,
            width: "100%",
          }}
        >
          {/* Kachel 1: Spielzeit */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: isStory ? 469 : 480,
              padding: isStory ? "28px 30px" : "18px 24px",
              borderRadius: 28,
              background: "rgba(139, 92, 246, 0.16)",
              border: "2px solid rgba(167, 139, 250, 0.35)",
            }}
          >
            <span
              style={{
                fontSize: isStory ? 20 : 16,
                fontWeight: 700,
                color: "#c4b5fd",
                textTransform: "uppercase",
                letterSpacing: 1.2,
              }}
            >
              {playtimeTitle}
            </span>
            <span
              style={{
                fontSize: isStory ? 56 : 42,
                fontWeight: 900,
                color: "#ffffff",
                marginTop: 6,
              }}
            >
              {review.playtimeSource === "unbekannt" ? "Unbekannt" : `${review.playtimeSource === "geschätzt (Erfolge)" ? "ca. " : ""}${formatMinutes(review.playtimeMin)}`}
            </span>
            <span style={{ fontSize: isStory ? 18 : 14, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
              {playtimeSub}
            </span>
          </div>

          {/* Kachel 2: Durchgespielt */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: isStory ? 469 : 480,
              padding: isStory ? "28px 30px" : "18px 24px",
              borderRadius: 28,
              background: "rgba(16, 185, 129, 0.15)",
              border: "2px solid rgba(52, 211, 153, 0.35)",
            }}
          >
            <span
              style={{
                fontSize: isStory ? 20 : 16,
                fontWeight: 700,
                color: "#6ee7b7",
                textTransform: "uppercase",
                letterSpacing: 1.2,
              }}
            >
              Durchgespielt
            </span>
            <span
              style={{
                fontSize: isStory ? 56 : 42,
                fontWeight: 900,
                color: "#34d399",
                marginTop: 6,
              }}
            >
              {`${review.completedGames.length} ${review.completedGames.length === 1 ? "Spiel" : "Spiele"}`}
            </span>
            <span style={{ fontSize: isStory ? 18 : 14, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
              {`+${review.newGamesCount} neu in der Sammlung`}
            </span>
          </div>

          {/* Kachel 3: Lieblingsgenre */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: isStory ? 469 : 480,
              padding: isStory ? "26px 30px" : "18px 24px",
              borderRadius: 28,
              background: "rgba(255, 255, 255, 0.05)",
              border: "2px solid rgba(255, 255, 255, 0.14)",
            }}
          >
            <span
              style={{
                fontSize: isStory ? 20 : 16,
                fontWeight: 700,
                color: "#7dd3fc",
                textTransform: "uppercase",
                letterSpacing: 1.2,
              }}
            >
              Lieblingsgenre
            </span>
            <span
              style={{
                fontSize: isStory ? 42 : 32,
                fontWeight: 900,
                color: "#ffffff",
                marginTop: 6,
              }}
            >
              {review.topGenre ? review.topGenre.genre : "Vielseitig"}
            </span>
            <span style={{ fontSize: isStory ? 18 : 14, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
              {review.topGenre
                ? `${review.topGenre.source === "geschätzt (Erfolge)" ? "ca. " : ""}${formatMinutes(review.topGenre.playtimeMin)} · ${review.topGenre.gameCount} Spiele`
                : "Quer durch die Bibliothek"}
            </span>
          </div>

          {/* Kachel 4: Top-Plattform */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: isStory ? 469 : 480,
              padding: isStory ? "26px 30px" : "18px 24px",
              borderRadius: 28,
              background: "rgba(255, 255, 255, 0.05)",
              border: "2px solid rgba(255, 255, 255, 0.14)",
            }}
          >
            <span
              style={{
                fontSize: isStory ? 20 : 16,
                fontWeight: 700,
                color: "#fcd34d",
                textTransform: "uppercase",
                letterSpacing: 1.2,
              }}
            >
              Top-Plattform
            </span>
            <span
              style={{
                fontSize: isStory ? 42 : 32,
                fontWeight: 900,
                color: "#ffffff",
                marginTop: 6,
              }}
            >
              {review.topPlatform ? review.topPlatform.label : "Multiplattform"}
            </span>
            <span style={{ fontSize: isStory ? 18 : 14, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
              {review.topPlatform
                ? `${review.topPlatform.source === "geschätzt (Erfolge)" ? "ca. " : ""}${formatMinutes(review.topPlatform.playtimeMin)} (${review.topPlatform.sharePercent} %)`
                : `${review.platforms.length} Plattformen`}
            </span>
          </div>
        </div>

        {/* 3. Meistgespieltes Spiel (#1 Highlight) */}
        {mostPlayed && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: isStory ? "26px 30px" : "18px 24px",
              borderRadius: 28,
              background: "linear-gradient(90deg, rgba(139,92,246,0.24) 0%, rgba(16,185,129,0.18) 100%)",
              border: "2px solid rgba(167, 139, 250, 0.4)",
              gap: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 24, flex: 1 }}>
              {mostPlayedCover ? (
                <img
                  src={mostPlayedCover}
                  alt={mostPlayed.game.title}
                  width={isStory ? 114 : 84}
                  height={isStory ? 152 : 112}
                  style={{
                    borderRadius: 16,
                    objectFit: "cover",
                    border: "2px solid rgba(255,255,255,0.25)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: isStory ? 114 : 84,
                    height: isStory ? 152 : 112,
                    borderRadius: 16,
                    background: `linear-gradient(135deg, hsl(${coverHue(mostPlayed.game.title)}, 65%, 35%), hsl(${(coverHue(mostPlayed.game.title) + 60) % 360}, 65%, 20%))`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: isStory ? 34 : 26,
                    fontWeight: 900,
                    color: "#ffffff",
                  }}
                >
                  {coverInitials(mostPlayed.game.title)}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <span
                  style={{
                    fontSize: isStory ? 18 : 14,
                    fontWeight: 800,
                    color: "#fde68a",
                    textTransform: "uppercase",
                    letterSpacing: 1.5,
                  }}
                >
                  #1 Meistgespieltes Spiel
                </span>
                <span
                  style={{
                    fontSize: isStory ? 36 : 28,
                    fontWeight: 900,
                    color: "#ffffff",
                  }}
                >
                  {mostPlayed.game.title.length > 36
                    ? `${mostPlayed.game.title.slice(0, 34)}…`
                    : mostPlayed.game.title}
                </span>
                <span
                  style={{
                    fontSize: isStory ? 28 : 22,
                    fontWeight: 800,
                    color: "#34d399",
                  }}
                >
                  {`${mostPlayed.source === "geschätzt (Erfolge)" ? "ca. " : ""}${formatMinutes(mostPlayed.playtimeMin)} im Jahr ${review.year}`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 4. Cover-Collage der Spiele des Jahres */}
        <div style={{ display: "flex", flexDirection: "column", gap: isStory ? 18 : 12, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <span
              style={{
                fontSize: isStory ? 22 : 16,
                fontWeight: 800,
                color: "rgba(255,255,255,0.8)",
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}
            >
              Highlights deiner Sammlung
            </span>
            {review.longestCompleted && (
              <span style={{ fontSize: isStory ? 18 : 14, color: "#a7f3d0", fontWeight: 600 }}>
                {`Längstes Finale: ${review.longestCompleted.game.title.slice(0, 24)} (${formatMinutes(review.longestCompleted.durationMin)})`}
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: isStory ? 16 : 16,
              width: "100%",
              justifyContent: "space-between",
            }}
          >
            {collageItems.map((g) => {
              const dataUrl = coverMap.get(g.id) ?? null;
              const h = coverHue(g.title);
              const cardW = isStory ? 146 : 228;
              const cardH = isStory ? 204 : 156;
              return (
                <div
                  key={g.id}
                  style={{
                    width: cardW,
                    height: cardH,
                    borderRadius: 18,
                    overflow: "hidden",
                    display: "flex",
                    position: "relative",
                    border: "2px solid rgba(255,255,255,0.18)",
                    background: `linear-gradient(145deg, hsl(${h}, 60%, 30%), hsl(${(h + 60) % 360}, 60%, 16%))`,
                  }}
                >
                  {dataUrl ? (
                    <img
                      src={dataUrl}
                      alt={g.title}
                      width={cardW}
                      height={cardH}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 12,
                        textAlign: "center",
                      }}
                    >
                      <span style={{ fontSize: 32, fontWeight: 900, color: "#ffffff" }}>
                        {coverInitials(g.title)}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.85)",
                          marginTop: 6,
                        }}
                      >
                        {g.title.length > 22 ? `${g.title.slice(0, 20)}…` : g.title}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Fußzeile (ohne jegliche Kontodaten) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            paddingTop: isStory ? 18 : 10,
            borderTop: "2px solid rgba(255,255,255,0.1)",
            fontSize: isStory ? 20 : 15,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          <span>NextQuest · Alle Spielebibliotheken an einem Ort</span>
          <span style={{ color: "#c4b5fd", fontWeight: 700 }}>
            {`${games.length} Spiele in der Sammlung`}
          </span>
        </div>
      </div>
    ),
    {
      width,
      height,
      headers: {
        "Content-Disposition": `inline; filename="nextquest-wrapped-${review.year}-${format}.png"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
