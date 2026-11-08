import "server-only";
import { tx } from "./db";
import { deleteBySource, upsertOwnership } from "./library";
import { steamCover } from "./steam";

import { DEMO } from "./demo-data";

const H = (h: number) => Math.round(h * 60);

export function loadDemo() {
  tx(() => {
    deleteBySource("demo");
    for (const d of DEMO) {
      for (const [platform, hours] of d.on) {
        upsertOwnership({
          platform,
          externalId: `demo-${platform}-${d.title}`,
          title: d.title,
          playtimeMin: H(hours),
          lastPlayed: hours > 0 ? new Date(Date.now() - Math.random() * 200 * 86400_000).toISOString() : null,
          source: "demo",
          meta: {
            title: d.title,
            coverUrl: d.steam ? steamCover(d.steam) : null,
            rating: d.rating,
            ratingCount: d.votes,
            genres: d.genres,
            modes: d.modes ?? ["Single player"],
            ttbHastily: H(d.ttb[0]),
            ttbNormally: H(d.ttb[1]),
            ttbCompletely: H(d.ttb[2]),
            releaseYear: d.year,
          },
        });
      }
    }
  });
  return { count: DEMO.length };
}

export function clearDemo() {
  deleteBySource("demo");
}
