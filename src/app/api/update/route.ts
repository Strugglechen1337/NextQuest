import { connection } from "next/server";
import { getSetting, setSetting } from "@/lib/settings";
import { readStatus, requestUpdate, updateDirectory, versions } from "@/lib/updater";

export async function GET() {
  await connection();
  const current = process.env.NEXTQUEST_COMMIT || "dev";
  const dir = await updateDirectory();
  const [version, status] = await Promise.all([versions(current), readStatus(dir)]);
  return Response.json({ current, ...version, status, auto: getSetting("update.auto") === "1", configured: !!dir });
}
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "start" && !('auto' in body)) await requestUpdate();
    else if (typeof body.auto === "boolean" && !('action' in body)) setSetting("update.auto", body.auto ? "1" : "0");
    else return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Anfrage fehlgeschlagen." }, { status: 409 }); }
}
