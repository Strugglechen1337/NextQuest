import type { Game } from "./types";

export interface StoreInput { title: string; platform?: string; id?: string; kind?: string }
export function parseStoreInput(input: string): StoreInput {
  const text = input.trim();
  let url: URL;
  try { url = new URL(text); } catch { return { title: text }; }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
  const after = (part: string) => { const i = parts.indexOf(part); return i < 0 ? undefined : parts[i + 1]; };
  if (host === "store.steampowered.com" && /^\d+$/.test(after("app") ?? "")) return { title: after("app")!, platform: "steam", id: after("app"), kind: "steam" };
  if (["www.xbox.com", "xbox.com", "www.microsoft.com", "microsoft.com", "apps.microsoft.com"].includes(host)) {
    const id = parts.find(p => /^[a-z0-9]{12}$/i.test(p));
    if (id) return { title: id, platform: "xbox", id: id.toUpperCase(), kind: "microsoft" };
  }
  if (host === "store.playstation.com") {
    const id = after("concept") ?? after("product");
    if (id) return { title: id, platform: "playstation", id: after("concept") ? `concept:${id}` : id, kind: after("concept") ? "ps-concept" : "ps-product" };
  }
  if (["www.gog.com", "gog.com", "store.epicgames.com"].includes(host)) {
    const slug = host.includes("gog.com") ? after("game") : after("p") ?? after("product");
    if (slug) return { title: slug.replace(/[-_]+/g, " "), platform: host.includes("gog.com") ? "gog" : "epic", id: slug };
  }
  return { title: text };
}

const roman: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
export function comparable(title: string, normalize: (s: string) => string): string {
  return normalize(title).split(" ").map(w => roman[w] ?? w).join(" ").trim();
}
export function matchGames(games: Game[], input: StoreInput, normalize: (s: string) => string, igdbId?: number | null) {
  const q = comparable(input.title, normalize);
  const exact: Game[] = [], similar: Game[] = [];
  for (const game of games) {
    const names = [game.title, ...game.ownerships.map(o => o.title)].map(n => comparable(n, normalize));
    const idMatch = input.id && game.ownerships.some(o => (o.platform === input.platform || (input.platform === "xbox" && o.platform === "gamepass")) && o.externalId.toLowerCase() === input.id!.toLowerCase());
    if (idMatch || (igdbId && game.igdbId === igdbId) || (q && names.includes(q))) exact.push(game);
    else if (q.length >= 3 && names.some(n => n.length >= 3 && (n.startsWith(q + " ") || q.startsWith(n + " ")))) similar.push(game);
  }
  return { exact, similar: similar.slice(0, 8) };
}
