import { handle } from "@/lib/api";
import { upsertOwnership, type GameMeta } from "@/lib/library";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";

/** Spiel manuell hinzufügen (z. B. Switch, Ubisoft) */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    title: string;
    platform: PlatformId;
    playtimeHours?: number;
    meta?: GameMeta;
  };
  return handle(() => {
    const title = body.meta?.title ?? body.title?.trim();
    if (!title) throw new Error("Bitte einen Titel angeben.");
    if (!PLATFORMS[body.platform]?.manual) throw new Error("Unbekannte Plattform.");
    const id = upsertOwnership({
      platform: body.platform,
      externalId: `manual-${crypto.randomUUID()}`,
      title,
      playtimeMin: Math.round((body.playtimeHours ?? 0) * 60),
      source: "manual",
      meta: body.meta,
    });
    return { id };
  });
}
