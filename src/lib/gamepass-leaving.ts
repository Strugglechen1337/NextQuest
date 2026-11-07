// Live geprüft am 2026-11-07 in Microsofts xgpcatPopulate-2025.js:
// https://www.xbox.com/en-us/xbox-game-pass/games/js/xgpcatPopulate-2025.js
export const LEAVING_CATALOGS = { pc: "cc7fc951-d00f-410e-9e02-5e4628e04163", console: "393f05bf-e596-4ef6-9487-6d4fa0eab987" } as const;
export async function fetchLeavingSoon(catalogs: (keyof typeof LEAVING_CATALOGS)[], market: string): Promise<Set<string> | null> {
  const ids = new Set<string>();
  try {
    for (const catalog of catalogs) {
      const res = await fetch(`https://catalog.gamepass.com/sigls/v2?id=${LEAVING_CATALOGS[catalog]}&language=${market === "DE" || market === "AT" ? "de-de" : "en-us"}&market=${encodeURIComponent(market)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data: unknown = await res.json();
      if (!Array.isArray(data) || !data.length) return null;
      // First entry is catalog metadata, products have 12-character Microsoft Store IDs.
      for (const row of data) {
        if (row && typeof row === "object" && "id" in row && typeof row.id === "string" && /^[A-Z0-9]{12}$/i.test(row.id)) ids.add(row.id.toUpperCase());
      }
    }
    return ids;
  } catch { return null; }
}
