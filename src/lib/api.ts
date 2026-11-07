import "server-only";

/** Einheitliche Fehlerbehandlung für API-Routen. */
export async function handle(fn: () => unknown | Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data ?? { ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler";
    console.error("[NextQuest]", message);
    return Response.json({ error: message }, { status: 400 });
  }
}

export const isMasked = (v: unknown) => typeof v === "string" && v.startsWith("••••");
