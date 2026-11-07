import { handle, isMasked } from "@/lib/api";
import { testIgdb } from "@/lib/igdb";
import { getSetting, setSetting } from "@/lib/settings";
import { testSteam } from "@/lib/steam";
import { testPlayStation } from "@/lib/playstation";

/** Testet Zugangsdaten und speichert sie bei Erfolg. */
export async function POST(req: Request, ctx: RouteContext<"/api/test/[service]">) {
  const { service } = await ctx.params;
  const body = (await req.json()) as Record<string, string>;
  return handle(async () => {
    if (service === "playstation") {
      if (typeof body.npsso !== "string") throw new Error("Bitte den NPSSO-Code eintragen.");
      return testPlayStation(body.npsso);
    }
    if (service === "steam") {
      const apiKey = isMasked(body.apiKey) ? getSetting("steam.apiKey") : body.apiKey?.trim();
      if (!apiKey) throw new Error("Bitte den Steam-API-Key eintragen.");
      if (!body.profile?.trim()) throw new Error("Bitte dein Steam-Profil eintragen.");
      const result = await testSteam(apiKey, body.profile);
      setSetting("steam.apiKey", apiKey);
      setSetting("steam.steamId", result.steamId);
      return result;
    }
    if (service === "igdb") {
      const clientId = body.clientId?.trim();
      const secret = isMasked(body.clientSecret) ? getSetting("igdb.clientSecret") : body.clientSecret?.trim();
      if (!clientId || !secret) throw new Error("Bitte Client-ID und Client-Secret eintragen.");
      const result = await testIgdb(clientId, secret);
      setSetting("igdb.clientId", clientId);
      setSetting("igdb.clientSecret", secret);
      setSetting("igdb.token", null);
      return result;
    }
    throw new Error("Unbekannter Dienst");
  });
}
