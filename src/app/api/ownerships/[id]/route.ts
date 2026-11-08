import { handle } from "@/lib/api";
import { deleteOwnership, splitOwnership } from "@/lib/library";

/** Eintrag aus der Gruppe lösen (falsche Zuordnung korrigieren) */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(() => ({ id: splitOwnership(Number(id)) }));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(() => deleteOwnership(Number(id)));
}
