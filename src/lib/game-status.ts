export const GAME_STATUSES = { open: "Offen", wanted: "Will ich spielen", playing: "Spiele ich gerade", paused: "Pausiert", abandoned: "Abgebrochen", completed: "Durchgespielt" } as const;
export type GameStatus = keyof typeof GAME_STATUSES;
export function effectiveStatus(status: string | null | undefined, completed: boolean): GameStatus {
  if (completed) return "completed";
  return status && Object.hasOwn(GAME_STATUSES, status) && status !== "completed" ? status as GameStatus : "open";
}
