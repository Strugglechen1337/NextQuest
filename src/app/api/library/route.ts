import { connection } from "next/server";
import { handle } from "@/lib/api";
import { igdbConfigured } from "@/lib/igdb";
import { listGames, stats } from "@/lib/library";
import { publicSettings } from "@/lib/settings";

export async function GET() {
  await connection();
  return handle(() => {
    const games = listGames();
    return { games, stats: stats(games), settings: publicSettings(), igdb: igdbConfigured() };
  });
}
