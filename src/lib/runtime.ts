export type Runtime = "windows" | "docker" | "linux" | "dev";

/**
 * In welcher Variante läuft NextQuest?
 * NEXTQUEST_RUNTIME setzen Docker-Image, Windows-App und die Linux-Units.
 * Fehlt sie, ist aber der Server-Updater eingerichtet (NEXTQUEST_UPDATE_DIR), handelt es sich um die
 * Linux-Server-Variante mit älterer Dienstdatei – dann den Update-Knopf nicht verstecken.
 */
export function runtime(value = process.env.NEXTQUEST_RUNTIME, updateDir = process.env.NEXTQUEST_UPDATE_DIR): Runtime {
  if (value === "windows" || value === "docker" || value === "linux") return value;
  return updateDir ? "linux" : "dev";
}

export function updateMode(value: Runtime) {
  return {
    showUpdater: value === "linux",
    message:
      value === "docker"
        ? "Neue Version: docker compose pull && docker compose up -d"
        : value === "windows"
          ? "Updates kommen automatisch über die Windows-App"
          : null,
  };
}
