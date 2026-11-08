export type Runtime = "windows" | "docker" | "linux" | "dev";
export function runtime(value = process.env.NEXTQUEST_RUNTIME): Runtime {
  return value === "windows" || value === "docker" || value === "linux" ? value : "dev";
}
export function updateMode(value: Runtime) {
  return { showUpdater: value === "linux", message: value === "docker" ? "Neue Version: docker compose pull && docker compose up -d" : value === "windows" ? "Updates kommen automatisch über die Windows-App" : null };
}
