import { connection } from "next/server";
import { handle, isMasked } from "@/lib/api";
import { publicSettings, setSetting, SETTING_KEYS, type SettingKey } from "@/lib/settings";

export async function GET() {
  await connection();
  return handle(() => publicSettings());
}

const EDITABLE: SettingKey[] = ["gamepass.enabled", "gamepass.catalogs", "gamepass.market"];

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, string | null>;
  return handle(() => {
    for (const [key, value] of Object.entries(body)) {
      if (!SETTING_KEYS.includes(key as SettingKey)) continue;
      if (!EDITABLE.includes(key as SettingKey) && value !== null) continue;
      if (isMasked(value)) continue;
      setSetting(key as SettingKey, value);
    }
    return publicSettings();
  });
}
