import "server-only";
import { db } from "./db";
import { igdbConfigured, igdbToSteam } from "./igdb";
import { getSetting, setSetting } from "./settings";

import htmlEntities from "./html-entities.json";
const entities: Record<string, string> = htmlEntities;

export function descriptionText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity] ?? all;
    const n = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  }).replace(/\s+/g, " ").trim();
}

interface Pending { id: number; igdb_id: number | null; steam: string[]; products: string[]; fingerprint: string }

// Persist the checked source IDs rather than a permanent notfound flag: later
// imports or an IGDB match automatically make previously missing games eligible.
function pendingGames(): Pending[] {
  const games = db().prepare("SELECT id, igdb_id, summary_de_state FROM games WHERE summary_de IS NULL OR summary_de = ''").all() as unknown as { id: number; igdb_id: number | null; summary_de_state: string | null }[];
  const owns = db().prepare("SELECT game_id, platform, external_id FROM ownerships WHERE platform IN ('steam', 'gamepass') ORDER BY external_id").all() as unknown as { game_id: number; platform: string; external_id: string }[];
  return games.flatMap(g => {
    const os = owns.filter(o => o.game_id === g.id);
    const steam = os.filter(o => o.platform === "steam" && /^\d+$/.test(o.external_id)).map(o => o.external_id);
    const products = os.filter(o => o.platform === "gamepass" && /^[A-Z0-9]{12}$/i.test(o.external_id)).map(o => o.external_id);
    const fingerprint = JSON.stringify([steam, products, igdbConfigured() ? g.igdb_id : null]);
    return g.summary_de_state === fingerprint ? [] : [{ ...g, steam, products, fingerprint }];
  });
}

let running: Promise<{ processed: number; matched: number; remaining: number; rateLimited: boolean }> | null = null;
let lastSteam = 0;
export function descriptionsBatch(limit = 25) {
  // Concurrent clicks share a batch, avoiding duplicate requests in one server.
  if (running) return running;
  running = loadBatch(Math.max(1, Math.min(25, limit))).finally(() => { running = null; });
  return running;
}

async function loadBatch(limit: number) {
  const pending = pendingGames().slice(0, limit);
  let processed = 0, matched = 0;
  const result = (rateLimited = false) => ({ processed, matched, remaining: pendingGames().length, rateLimited });
  if (Number(getSetting("descriptions.steamRetryAt") ?? 0) > Date.now()) return result(true);
  const ids = pending.filter(g => !g.steam.length && g.igdb_id).map(g => g.igdb_id!);
  const steamMap = igdbConfigured() ? await igdbToSteam(ids) : new Map<number, string[]>();
  const fallback: Pending[] = [];
  const save = (g: Pending, text: string) => {
    db().prepare("UPDATE games SET summary_de = ?, summary_de_state = ? WHERE id = ? AND (summary_de IS NULL OR summary_de = '')")
      .run(text || null, g.fingerprint, g.id);
    processed++;
    if (text) matched++;
  };
  for (const g of pending) {
    let text = "";
    for (const id of [...new Set([...g.steam, ...(steamMap.get(g.igdb_id!) ?? [])])]) {
      const pause = lastSteam + 1600 - Date.now();
      if (pause > 0) await new Promise(r => setTimeout(r, pause));
      lastSteam = Date.now();
      const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&l=german&cc=de&filters=basic`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (res.status === 429) {
        const header = res.headers.get("retry-after");
        const retry = header && /^\d+$/.test(header) ? Date.now() + Number(header) * 1000 : Date.parse(header ?? "");
        setSetting("descriptions.steamRetryAt", String(Math.max(Date.now() + 300_000, retry || 0)));
        return result(true);
      }
      if (!res.ok) throw new Error(`Steam-Beschreibungen nicht erreichbar (${res.status}). Bitte später erneut versuchen.`);
      const data = await res.json() as Record<string, { success?: boolean; data?: { short_description?: string } }>;
      if (data[id]?.success) text = descriptionText(data[id].data?.short_description ?? "");
      if (text) break;
    }
    if (text || !g.products.length) save(g, text);
    else fallback.push(g);
  }
  const productIds = [...new Set(fallback.flatMap(g => g.products))];
  const texts = new Map<string, string>();
  for (let i = 0; i < productIds.length; i += 100) {
    const res = await fetch(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${productIds.slice(i, i + 100).join(",")}&market=DE&languages=de-de`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Microsoft-Beschreibungen nicht erreichbar (${res.status}). Bitte später erneut versuchen.`);
    const data = await res.json() as { Products?: { ProductId: string; LocalizedProperties?: { ShortDescription?: string; ProductDescription?: string }[] }[] };
    if (!Array.isArray(data.Products)) throw new Error("Microsoft hat keine gültigen Produktdaten geliefert.");
    for (const p of data.Products) {
      const local = p.LocalizedProperties?.[0];
      const short = descriptionText(local?.ShortDescription ?? "");
      const long = descriptionText(local?.ProductDescription ?? "");
      texts.set(p.ProductId, short || (long.length > 700 ? `${long.slice(0, 697)}…` : long));
    }
  }
  for (const g of fallback) save(g, g.products.map(id => texts.get(id)).find(Boolean) ?? "");
  return result();
}
