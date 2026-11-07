import type { PlatformId } from "./platforms";

export interface Ownership {
  id: number;
  platform: PlatformId;
  externalId: string;
  title: string;
  playtimeMin: number;
  lastPlayed: string | null;
  source: "sync" | "manual" | "demo";
}

export interface Game {
  id: number;
  title: string;
  igdbId: number | null;
  coverUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  genres: string[];
  modes: string[];
  /** Spieldauer in Minuten (IGDB Time to Beat) */
  ttbHastily: number | null;
  ttbNormally: number | null;
  ttbCompletely: number | null;
  releaseYear: number | null;
  summary: string | null;
  completed: boolean;
  enrichState: "pending" | "done" | "notfound" | "manual";
  ownerships: Ownership[];
  /** abgeleitet */
  playtimeMin: number;
  lastPlayed: string | null;
  copies: number;
  inGamePass: boolean;
  owned: boolean;
}

export interface LibraryStats {
  total: number;
  owned: number;
  duplicates: number;
  completed: number;
  playtimeMin: number;
  gamePassOnly: number;
  pendingEnrich: number;
}
