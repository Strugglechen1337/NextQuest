export type PlatformId =
  | "steam"
  | "xbox"
  | "gamepass"
  | "playstation"
  | "gog"
  | "epic"
  | "ubisoft"
  | "switch"
  | "other";

export interface PlatformInfo {
  id: PlatformId;
  label: string;
  short: string;
  color: string;
  /** Abo statt Besitz – zählt nicht als Kopie im Mehrfachbesitz. */
  subscription?: boolean;
  /** Kann manuell hinzugefügt werden. */
  manual: boolean;
}

export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  steam: { id: "steam", label: "Steam", short: "Steam", color: "#2a475e", manual: true },
  xbox: { id: "xbox", label: "Xbox", short: "Xbox", color: "#107c10", manual: true },
  gamepass: {
    id: "gamepass",
    label: "Game Pass",
    short: "GP",
    color: "#0e7a0d",
    subscription: true,
    manual: false,
  },
  playstation: { id: "playstation", label: "PlayStation", short: "PS", color: "#0070d1", manual: true },
  gog: { id: "gog", label: "GOG", short: "GOG", color: "#86328a", manual: true },
  epic: { id: "epic", label: "Epic Games", short: "Epic", color: "#4b4b4b", manual: true },
  ubisoft: { id: "ubisoft", label: "Ubisoft Connect", short: "Ubi", color: "#0060e0", manual: true },
  switch: { id: "switch", label: "Nintendo Switch", short: "Switch", color: "#e60012", manual: true },
  other: { id: "other", label: "Sonstige", short: "Andere", color: "#6b7280", manual: true },
};

export const PLATFORM_ORDER: PlatformId[] = [
  "steam",
  "xbox",
  "gamepass",
  "playstation",
  "gog",
  "epic",
  "ubisoft",
  "switch",
  "other",
];
