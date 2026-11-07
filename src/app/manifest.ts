import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NextQuest",
    short_name: "NextQuest",
    description: "Alle Spielebibliotheken an einem Ort – was spiele ich als Nächstes?",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d14",
    theme_color: "#0b0d14",
    orientation: "any",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
