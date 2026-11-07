import type { Game } from "./types";

export type ShareImageFormat = "story" | "square";

export const ALLOWED_COVER_HOSTS: readonly string[] = [
  "images.igdb.com",
  "shared.steamstatic.com",
  "cdn.cloudflare.steamstatic.com",
  "steamcdn-a.akamaihd.net",
  "store-images.s-microsoft.com",
  "image.api.playstation.com",
  "images.gog-statics.com",
  "cdn1.epicgames.com",
  "cdn2.epicgames.com",
];

/** Prüft, ob eine Bild-URL von einem bekannten, erlaubten Cover-Host stammt (SSRF-/CORS-Schutz). */
export function isAllowedCoverUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_COVER_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

export function getShareImageDimensions(formatParam: string | null | undefined): {
  format: ShareImageFormat;
  width: number;
  height: number;
} {
  if (formatParam === "square" || formatParam === "1080x1080" || formatParam === "1:1") {
    return { format: "square", width: 1080, height: 1080 };
  }
  return { format: "story", width: 1080, height: 1920 };
}

export function coverInitials(title: string): string {
  return (
    title
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "NQ"
  );
}

export function coverHue(title: string): number {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/**
 * Lädt das erste verfügbare Cover eines Spiels von einem erlaubten Host und wandelt es
 * in eine Base64-Data-URL (JPEG/PNG) um, damit ImageResponse es ohne CORS-/Netzwerkfehler rendert.
 */
export async function fetchGameCoverDataUrl(game: Game, timeoutMs = 2500): Promise<string | null> {
  const candidates = [game.coverUrl, ...(game.coverFallbacks ?? [])].filter(
    (u): u is string => !!u && isAllowedCoverUrl(u),
  );
  for (const rawUrl of candidates) {
    const url = rawUrl.startsWith("http://") ? `https://${rawUrl.slice(7)}` : rawUrl;
    try {
      const res = await fetch(url, {
        headers: { Accept: "image/jpeg,image/png" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      const mime = ct.includes("png") ? "image/png" : ct.includes("jpeg") || ct.includes("jpg") ? "image/jpeg" : null;
      if (!mime) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 250 || buf.byteLength > 4_000_000) continue;
      return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
    } catch {
      // Nächste Fallback-URL probieren
    }
  }
  return null;
}
