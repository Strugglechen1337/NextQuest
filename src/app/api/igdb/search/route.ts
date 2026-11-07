import { type NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { igdbConfigured, searchIgdb } from "@/lib/igdb";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  return handle(async () => {
    if (!igdbConfigured() || q.length < 2) return { results: [] };
    return { results: await searchIgdb(q) };
  });
}
