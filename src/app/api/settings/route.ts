import { connection } from "next/server";
import { handle, isMasked } from "@/lib/api";
import { validateGoalsJson } from "@/lib/goals";
import { publicSettings, setSetting, SETTING_KEYS, type SettingKey } from "@/lib/settings";
import { validAutoTime } from "@/lib/jobs";

export async function GET() {
  await connection();
  return handle(() => publicSettings());
}

const EDITABLE: SettingKey[] = ["gamepass.enabled", "gamepass.catalogs", "gamepass.market", "auto.enabled", "auto.time", "goals"];

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  return handle(() => {
    if ("auto.time" in body && !validAutoTime(body["auto.time"] as string | null)) throw new Error("Uhrzeit muss HH:MM sein.");
    if ("auto.enabled" in body && !["0", "1"].includes((body["auto.enabled"] as string) ?? "")) throw new Error("Ungültiger Automatik-Schalter.");
    if ("goals" in body && body.goals !== null && body.goals !== "") {
      body.goals = validateGoalsJson(body.goals);
    }
    for (const [key, value] of Object.entries(body)) {
      if (!SETTING_KEYS.includes(key as SettingKey)) continue;
      if (["jobs.last", "auto.lastRun"].includes(key)) continue;
      if (!EDITABLE.includes(key as SettingKey) && value !== null) continue;
      if (isMasked(value)) continue;
      setSetting(key as SettingKey, value === null ? null : String(value));
    }
    return publicSettings();
  });
}
