import "server-only";
import { igdbWikipediaLinks } from "./igdb";

export interface DescriptionSource { source: "steam" | "microsoft" | "playstation" | "wikipedia"; url?: string }
let lastRequest = 0;
async function request(url: string) {
  const pause = lastRequest + 1000 - Date.now();
  if (pause > 0) await new Promise(r => setTimeout(r, pause));
  lastRequest = Date.now();
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "NextQuest/1.0 (private game library; description lookup)", "Accept-Language": "de-DE" } });
  if (!res.ok) throw new Error(`Description source: ${res.status}`);
  return res;
}
export function excerpt(text: string) {
  if (text.length <= 600) return text;
  const head = text.slice(0, 600);
  const end = [...head.matchAll(/[.!?](?=\s|$)/g)].at(-1)?.index;
  return end !== undefined && end > 150 ? head.slice(0, end + 1) : `${head.slice(0, 597).replace(/\s+\S*$/, "")}…`;
}

export async function playstationDescription(ids: string[], clean: (s: string) => string) {
  for (const id of ids) {
    // A bare title ID is not a product ID: never invent a regional SKU.
    const route = /^concept:\d+$/.test(id) ? `concept/${id.slice(8)}` : /^[A-Z]{2}\d{4}-[A-Z0-9_]+-[A-Z0-9]+$/i.test(id) ? `product/${id}` : null;
    if (!route) continue;
    try {
      const html = await (await request(`https://store.playstation.com/de-de/${route}`)).text();
      const candidates: string[] = [];
      function scan(value: unknown, depth = 0) {
        if (!value || typeof value !== "object" || depth > 40) return;
        const obj = value as Record<string, unknown>;
        if (/^(LONG|SHORT)$/i.test(String(obj.type)) && typeof obj.value === "string") candidates.push(clean(obj.value));
        for (const [key, child] of Object.entries(obj)) {
          if (/^(description|longDescription|shortDescription)$/i.test(key) && typeof child === "string" && !/rating|legal/i.test(String(obj.__typename))) candidates.push(clean(child));
          scan(child, depth + 1);
        }
      }
      for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        try { scan(JSON.parse(script[1])); } catch { /* non-JSON script */ }
      }
      const text = candidates.filter(t => t.length >= 60).sort((a, b) => b.length - a.length)[0];
      if (text) return excerpt(text);
    } catch { /* optional public source: continue with Wikipedia */ }
  }
  return "";
}

function titleKey(title: string) {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\((computerspiel|videospiel)\)/g, "").replace(/[™®©’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
interface Summary { title?: string; extract?: string; type?: string; lang?: string; namespace?: { id?: number } }
export async function wikipediaDescription(title: string, igdbId: number | null, clean: (s: string) => string) {
  try {
    const titles: string[] = [];
    const links = igdbId ? await igdbWikipediaLinks(igdbId).catch(() => []) : [];
    const entities: string[] = [];
    for (const link of links) {
      const url = new URL(link);
      if (url.hostname === "de.wikipedia.org" && url.pathname.startsWith("/wiki/")) titles.push(decodeURIComponent(url.pathname.slice(6)));
      if (/^[a-z-]+\.wikipedia\.org$/.test(url.hostname) && url.hostname !== "de.wikipedia.org" && url.pathname.startsWith("/wiki/")) {
        try {
          const page = await (await request(`https://${url.hostname}/api/rest_v1/page/summary/${encodeURIComponent(decodeURIComponent(url.pathname.slice(6)))}`)).json() as { wikibase_item?: string };
          if (/^Q\d+$/.test(page.wikibase_item ?? "")) entities.push(page.wikibase_item!);
        } catch { /* try title lookup */ }
      }
      if (url.hostname === "www.wikidata.org" && /^\/wiki\/Q\d+$/.test(url.pathname)) entities.push(url.pathname.slice(6));
    }
    try {
      if (!titles.length) {
        if (!entities.length) {
          const data = await (await request(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(title)}&language=en&format=json&limit=5`)).json() as { search?: { id: string }[] };
          entities.push(...(data.search ?? []).map(x => x.id));
        }
        if (entities.length) {
          const data = await (await request(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entities.join("|")}&props=claims|sitelinks&sitefilter=dewiki&format=json`)).json() as { entities?: Record<string, { claims?: { P31?: { mainsnak?: { datavalue?: { value?: { id?: string } } } }[] }; sitelinks?: { dewiki?: { title: string } } }> };
          for (const entity of Object.values(data.entities ?? {})) {
            if (entity.claims?.P31?.some(c => c.mainsnak?.datavalue?.value?.id === "Q7889") && entity.sitelinks?.dewiki) titles.push(entity.sitelinks.dewiki.title);
          }
        }
      }
    } catch { /* identity service unavailable: exact title still safe */ }
    if (!titles.length) {
      try {
        const data = await (await request(`https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title + " Computerspiel")}&srlimit=3&format=json`)).json() as { query?: { search?: { title: string }[] } };
        titles.push(...(data.query?.search ?? []).map(x => x.title).filter(t => titleKey(t) === titleKey(title)));
      } catch { /* exact title remains available */ }
    }
    titles.push(title); // exact-title summary also follows safe redirects
    for (const candidate of [...new Set(titles)]) {
      try {
        const summary = await (await request(`https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate)}`)).json() as Summary;
        const text = clean(summary.extract ?? "");
        if ((summary.namespace && summary.namespace.id !== 0) || (summary.lang && summary.lang !== "de") || summary.type === "disambiguation" || !summary.title || titleKey(summary.title) !== titleKey(title) || !/\b(Computerspiel|Videospiel|Rennspiel|Action.Adventure|Jump.?[’']?n.?Run|Rollenspiel|Lebenssimulation)\b/i.test(text.slice(0, 400)) || /\b(Musikalbum|Studioalbum|Fernsehserie|Roman|Spielfilm)\b/i.test(text.split(/(?<=[.!?])\s/)[0]) || text.length < 60) continue;
        return { text: excerpt(text), source: { source: "wikipedia", url: `https://de.wikipedia.org/wiki/${encodeURIComponent(summary.title.replace(/ /g, "_"))}` } as DescriptionSource };
      } catch { /* try another confident candidate */ }
    }
  } catch { /* no confident match or source unavailable */ }
  return null;
}
