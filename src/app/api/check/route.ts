import { type NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { parseStoreInput, matchGames } from "@/lib/check";
import { findIgdbIdentity } from "@/lib/check-igdb";
import { listGames, normalizeTitle } from "@/lib/library";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 1000);
  return handle(async () => {
    if (!q) return { query: "", exact: [], similar: [] };
    const input = parseStoreInput(q);
    try {
      if (input.kind === "steam") {
        const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${input.id}&filters=basic`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
        if (response.ok) { const data = await response.json(); input.title = data[input.id!]?.data?.name ?? input.title; }
      } else if (input.kind === "microsoft") {
        const response = await fetch(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${input.id}&market=DE&languages=de-de`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
        if (response.ok) { const data = await response.json(); input.title = data.Products?.[0]?.LocalizedProperties?.[0]?.ProductTitle ?? input.title; }
      } else if (input.kind === "ps-concept" || input.kind === "ps-product") {
        const id = input.kind === "ps-concept" ? input.id!.slice(8) : input.id!;
        if (/^[a-z0-9_-]+$/i.test(id)) {
          const route = input.kind === "ps-concept" ? "concept" : "product";
          const response = await fetch(`https://store.playstation.com/de-de/${route}/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
          if (response.ok) {
            const html = await response.text();
            const title = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];
            if (title) input.title = title.replace(/\s*[-|]\s*PlayStation.*$/i, "");
          }
        }
      }
    } catch { /* Lokaler ID-Abgleich bleibt auch ohne Store erreichbar. */ }
    const games = listGames();
    const preliminary = matchGames(games, input, normalizeTitle);
    const igdbId = preliminary.exact.length ? null : await findIgdbIdentity(input.title);
    return { query: input.title, unresolved: !!input.kind && (input.title === input.id || input.title === input.id?.replace(/^concept:/, "")), ...matchGames(games, input, normalizeTitle, igdbId) };
  });
}
