import { connection } from "next/server";
import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { igdbConfigured } from "@/lib/igdb";
import { listGames } from "@/lib/library";
import { computeYearReview, type PlaytimeSnapshotRow } from "@/lib/year-review";

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
    const review = computeYearReview(
      games,
      snapshots,
      requestedYear && Number.isInteger(requestedYear) ? requestedYear : undefined,
    );
    return {
      review,
      snapshots,
      games,
      igdb: igdbConfigured(),
    };
  });
}
