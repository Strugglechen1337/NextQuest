import { connection } from "next/server";
import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { igdbConfigured } from "@/lib/igdb";
import { listGames } from "@/lib/library";
import { computeYearReview, type PlaytimeSnapshotRow, type AchievementUnlockRow } from "@/lib/year-review";

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const requestedYear = yearParam ? Number(yearParam) : undefined;
  return handle(() => {
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
    return {
      review,
      snapshots,
      unlocks,
      games,
      igdb: igdbConfigured(),
    };
  });
}
