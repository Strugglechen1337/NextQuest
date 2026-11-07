import { syncXbox } from "@/lib/xbox";
import { handle } from "@/lib/api";
import { syncEpic } from "@/lib/epic";
import { syncGamePass } from "@/lib/gamepass";
import { syncGog } from "@/lib/gog";
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
      case "xbox":
        return syncXbox();
      case "xbox-disconnect":
        setSetting("xbox.apiKey", null);
        setSetting("xbox.xuid", null);
        setSetting("xbox.gamertag", null);
        setSetting("xbox.lastSync", null);
        deletePlatform("xbox");
        return { ok: true };
      case "gog":
        return syncGog();
      case "gog-disconnect":
        setSetting("gog.refreshToken", null);
        setSetting("gog.accessToken", null);
        setSetting("gog.accessExpires", null);
        setSetting("gog.userId", null);
        setSetting("gog.lastSync", null);
        deletePlatform("gog");
        return { ok: true };
      case "epic":
        return syncEpic();
      case "epic-disconnect":
        setSetting("epic.refreshToken", null);
        setSetting("epic.accessToken", null);
        setSetting("epic.accessExpires", null);
        setSetting("epic.accountId", null);
        setSetting("epic.displayName", null);
        setSetting("epic.lastSync", null);
        deletePlatform("epic");
        return { ok: true };
      default:
        throw new Error("Unbekannte Quelle");
    }
  });
}
