import { handle } from "@/lib/api";
import { syncGamePass } from "@/lib/gamepass";
import { enrichBatch, resetNotFound } from "@/lib/igdb";
import { deletePlatform } from "@/lib/library";
import { setSetting } from "@/lib/settings";
import { syncSteam } from "@/lib/steam";
import { disconnectPlayStation, syncPlayStation } from "@/lib/playstation";

export async function POST(_req: Request, ctx: RouteContext<"/api/sync/[source]">) {
  const { source } = await ctx.params;
  return handle(async () => {
    switch (source) {
      case "playstation":
        return syncPlayStation();
      case "playstation-disconnect":
        disconnectPlayStation();
        deletePlatform("playstation");
        return { ok: true };
      case "steam":
        return syncSteam();
      case "gamepass":
        return syncGamePass();
      case "igdb":
        return enrichBatch(40);
      case "igdb-retry":
        resetNotFound();
        return enrichBatch(40);
      case "steam-disconnect":
        setSetting("steam.apiKey", null);
        setSetting("steam.steamId", null);
        setSetting("steam.lastSync", null);
        deletePlatform("steam");
        return { ok: true };
      default:
        throw new Error("Unbekannte Quelle");
    }
  });
}
