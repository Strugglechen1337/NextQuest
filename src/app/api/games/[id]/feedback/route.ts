import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { timeClass } from "@/lib/session-learning";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json() as { minutes?: unknown; value?: unknown };
  return handle(() => {
    if (typeof body.minutes !== "number" || !Number.isFinite(body.minutes) || body.minutes <= 0 || ![-1, 1].includes(body.value as number)) throw new Error("Ungültiges Zeit-Feedback");
    db().prepare("INSERT INTO suggestion_feedback(game_id, time_class, value) VALUES (?, ?, ?) ON CONFLICT(game_id, time_class) DO UPDATE SET value = excluded.value").run(Number(id), timeClass(body.minutes), body.value as number);
    return { ok: true };
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(() => {
    db().prepare("DELETE FROM suggestion_feedback WHERE game_id = ?").run(Number(id));
    return { ok: true };
  });
}
