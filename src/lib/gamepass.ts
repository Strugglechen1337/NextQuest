import "server-only";
import { tx } from "./db";
import { fetchLeavingSoon } from "./gamepass-leaving";
import { deletePlatform, pruneOwnerships, upsertOwnership } from "./library";
import { getSetting, setSetting } from "./settings";

export const GAMEPASS_CATALOGS = {
  pc: { id: "fdd9e2a7-0fee-49f6-ad69-4354098401ff", label: "PC Game Pass" },
  console: { id: "f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e", label: "Game Pass (Konsole)" },
} as const;

export type GamePassCatalog = keyof typeof GAMEPASS_CATALOGS;

interface Product {
  ProductId: string;
  LocalizedProperties: {
    ProductTitle: string;
    Images: { ImagePurpose: string; Uri: string; Width: number; Height: number }[];
  }[];
}

async function catalogIds(catalog: GamePassCatalog, market: string): Promise<string[]> {
  const lang = market === "DE" || market === "AT" ? "de-de" : market === "CH" ? "de-ch" : "en-us";
  const res = await fetch(
    `https://catalog.gamepass.com/sigls/v2?id=${GAMEPASS_CATALOGS[catalog].id}&language=${lang}&market=${market}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Game-Pass-Katalog nicht erreichbar (${res.status})`);
  const data = (await res.json()) as ({ id?: string } & Record<string, unknown>)[];
  return data.map((x) => x.id).filter((x): x is string => !!x);
}

async function productDetails(ids: string[], market: string): Promise<Product[]> {
  const lang = market === "DE" || market === "AT" ? "de-de" : "en-us";
  const out: Product[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await fetch(
      `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${chunk.join(",")}&market=${market}&languages=${lang}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`Microsoft-Store-Details nicht erreichbar (${res.status})`);
    const data = (await res.json()) as { Products?: Product[] };
    out.push(...(data.Products ?? []));
  }
  return out;
}

function poster(p: Product): string | null {
  const imgs = p.LocalizedProperties[0]?.Images ?? [];
  const img =
    imgs.find((i) => i.ImagePurpose === "Poster") ??
    imgs.find((i) => i.ImagePurpose === "BoxArt") ??
    imgs.find((i) => i.ImagePurpose === "BrandedKeyArt");
  if (!img) return null;
  const uri = img.Uri.startsWith("//") ? `https:${img.Uri}` : img.Uri;
  return `${uri}?w=300`;
}

export function gamePassCatalogs(): GamePassCatalog[] {
  const raw = getSetting("gamepass.catalogs") ?? "pc,console";
  return raw.split(",").filter((c): c is GamePassCatalog => c in GAMEPASS_CATALOGS);
}

export async function syncGamePass() {
  if (getSetting("gamepass.enabled") !== "1") {
    deletePlatform("gamepass");
    return { count: 0 };
  }
  const market = getSetting("gamepass.market") ?? "DE";
  const catalogs = gamePassCatalogs();
  const ids = new Set<string>();
  for (const c of catalogs) for (const id of await catalogIds(c, market)) ids.add(id);
  const products = await productDetails([...ids], market);
  const leaving = await fetchLeavingSoon(catalogs, market);
  tx(() => {
    for (const p of products) {
      const title = p.LocalizedProperties[0]?.ProductTitle;
      if (!title) continue;
      upsertOwnership({
        leavingSoon: leaving ? leaving.has(p.ProductId.toUpperCase()) : undefined,
        platform: "gamepass",
        externalId: p.ProductId,
        title,
        coverUrl: poster(p),
      });
    }
    pruneOwnerships("gamepass", new Set(products.map((p) => p.ProductId)));
  });
  setSetting("gamepass.lastSync", new Date().toISOString());
  return { count: products.length };
}
