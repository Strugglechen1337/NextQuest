import "server-only";
import { getSetting } from "./settings";
import { comparable } from "./check";
import { normalizeTitle } from "./library";

/** IGDB-Abfrage ohne Token oder Einstellungen in der Datenbank zu verändern. */
export async function findIgdbIdentity(title: string): Promise<number | null> {
  const client = getSetting("igdb.clientId"), secret = getSetting("igdb.clientSecret");
  if (!client || !secret || title.length < 2) return null;
  try {
    const auth = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(client)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!auth.ok) return null;
    const { access_token } = await auth.json();
    const query = title.replace(/[\\"\r\n]/g, " ");
    const response = await fetch("https://api.igdb.com/v4/games", { method: "POST", headers: { "Client-ID": client, Authorization: `Bearer ${access_token}` }, body: `search "${query}"; fields id,name; limit 8;`, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const games = await response.json() as { id: number; name: string }[];
    const target = comparable(title, normalizeTitle);
    return games.find(g => comparable(g.name, normalizeTitle) === target)?.id ?? null;
  } catch { return null; }
}
