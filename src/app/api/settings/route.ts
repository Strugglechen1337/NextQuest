import { connection } from "next/server";
import { handle, isMasked } from "@/lib/api";
import { publicSettings, setSetting, SETTING_KEYS, type SettingKey } from "@/lib/settings";
import { validAutoTime } from "@/lib/jobs";

export async function GET() {
  await connection();
  return handle(() => publicSettings());
}

const EDITABLE: SettingKey[] = ["gamepass.enabled", "gamepass.catalogs", "gamepass.market", "auto.enabled", "auto.time"];

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, string | null>;
  return handle(() => {
    if ("auto.time" in body && !validAutoTime(body["auto.time"])) throw new Error("Uhrzeit muss HH:MM sein.");
    if ("auto.enabled" in body && !["0", "1"].includes(body["auto.enabled"] ?? "")) throw new Error("Ungültiger Automatik-Schalter.");
    for (const [key, value] of Object.entries(body)) {
      if (!SETTING_KEYS.includes(key as SettingKey)) continue;
      if (["jobs.last", "auto.lastRun"].includes(key)) continue;
      if (!EDITABLE.includes(key as SettingKey) && value !== null) continue;
      if (isMasked(value)) continue;
      setSetting(key as SettingKey, value);
    }
    return publicSettings();
  });
}
