import { connection } from "next/server";
import { handle } from "@/lib/api";
import { parseGoals, validateGoalInput, validateGoalsJson, type Goal } from "@/lib/goals";
import { getSetting, setSetting } from "@/lib/settings";

export function readStoredGoals(): Goal[] {
  return parseGoals(getSetting("goals"));
}

export function writeStoredGoals(goals: unknown): Goal[] {
  const json = validateGoalsJson(goals);
  const parsed = JSON.parse(json) as Goal[];
  setSetting("goals", parsed.length > 0 ? json : null);
  return parsed;
}

export async function GET() {
  await connection();
  return handle(() => ({ goals: readStoredGoals() }));
}

export async function POST(req: Request) {
  const body = (await req.json()) as unknown;
  return handle(() => {
    if (body && typeof body === "object" && !Array.isArray(body) && "goals" in (body as Record<string, unknown>)) {
      const goals = writeStoredGoals((body as { goals: unknown }).goals);
      return { goals };
    }
    if (Array.isArray(body)) {
      const goals = writeStoredGoals(body);
      return { goals };
    }
    const goal = validateGoalInput(body);
    const existing = readStoredGoals();
    const idx = existing.findIndex((g) => g.id === goal.id);
    const next = idx >= 0 ? existing.map((g, i) => (i === idx ? goal : g)) : [...existing, goal];
    const goals = writeStoredGoals(next);
    return { goal, goals };
  });
}

export async function PUT(req: Request) {
  return POST(req);
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const queryId = url.searchParams.get("id");
  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  return handle(() => {
    if (body.all) {
      setSetting("goals", null);
      return { goals: [] };
    }
    const targetId = queryId ?? body.id;
    if (!targetId || typeof targetId !== "string") {
      throw new Error("Ziel-ID zum Löschen fehlt.");
    }
    const existing = readStoredGoals();
    const next = existing.filter((g) => g.id !== targetId);
    const goals = writeStoredGoals(next);
    return { goals };
  });
}
