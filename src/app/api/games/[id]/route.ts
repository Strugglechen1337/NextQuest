import { handle } from "@/lib/api";
import { db, tx } from "@/lib/db";
import { applyMeta, setCompleted, setGameStatus, setUserReview, type GameMeta } from "@/lib/library";

export async function PATCH(req: Request, ctx: RouteContext<"/api/games/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { completed?: boolean; meta?: GameMeta; sessionPref?: unknown; status?: import("@/lib/game-status").GameStatus; userNote?: unknown; userRating?: unknown };
  return handle(() => tx(() => {
    const gameId = Number(id);
    if (body.sessionPref !== undefined) {
      if (body.sessionPref !== null && !["short", "medium", "long"].includes(body.sessionPref as string)) {
        throw new Error("Ungültige Session-Länge");
      }
      db().prepare("UPDATE games SET session_pref = ? WHERE id = ?").run(body.sessionPref as string | null, gameId);
    }
    if (typeof body.completed === "boolean") setCompleted(gameId, body.completed);
    if (body.status !== undefined) setGameStatus(gameId, body.status);
    setUserReview(gameId, body.userNote, body.userRating);
    if (body.meta) {
      const target = applyMeta(gameId, body.meta!, "done");
      return { id: target };
    }
    return { id: gameId };
  }));
}
