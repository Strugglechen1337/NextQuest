import { handle } from "@/lib/api";
import { tx } from "@/lib/db";
import { applyMeta, setCompleted, type GameMeta } from "@/lib/library";

export async function PATCH(req: Request, ctx: RouteContext<"/api/games/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { completed?: boolean; meta?: GameMeta };
  return handle(() => {
    const gameId = Number(id);
    if (typeof body.completed === "boolean") setCompleted(gameId, body.completed);
    if (body.meta) {
      const target = tx(() => applyMeta(gameId, body.meta!, "done"));
      return { id: target };
    }
    return { id: gameId };
  });
}
