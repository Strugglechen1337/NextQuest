import "server-only";
import { tx } from "./db";
import { deleteBySource, upsertOwnership } from "./library";
import type { PlatformId } from "./platforms";
import { steamCover } from "./steam";

type Demo = {
  title: string;
  steam?: number;
  on: [PlatformId, number][]; // Plattform, Spielzeit in Stunden
  ttb: [number, number, number]; // Stunden: schnell, normal, komplett
  rating: number;
  votes: number;
  genres: string[];
  modes?: string[];
  year: number;
};

const H = (h: number) => Math.round(h * 60);

const DEMO: Demo[] = [
  { title: "The Witcher 3: Wild Hunt", steam: 292030, on: [["steam", 64], ["gog", 12]], ttb: [40, 52, 105], rating: 93, votes: 4100, genres: ["Role-playing (RPG)", "Adventure", "Open world"], year: 2015 },
  { title: "Hades", steam: 1145360, on: [["steam", 31], ["switch", 8]], ttb: [20, 23, 95], rating: 92, votes: 1900, genres: ["Roguelike", "Action", "Indie"], year: 2020 },
  { title: "Hades II", steam: 1145350, on: [["steam", 0]], ttb: [25, 35, 80], rating: 91, votes: 600, genres: ["Roguelike", "Action", "Indie"], year: 2025 },
  { title: "Stardew Valley", steam: 413150, on: [["steam", 120], ["switch", 20], ["gamepass", 0]], ttb: [50, 53, 160], rating: 89, votes: 2300, genres: ["Simulator", "Role-playing (RPG)", "Indie"], modes: ["Multiplayer"], year: 2016 },
  { title: "Hollow Knight", steam: 367520, on: [["steam", 14], ["gamepass", 0]], ttb: [27, 42, 63], rating: 90, votes: 2100, genres: ["Platform", "Adventure", "Indie"], year: 2017 },
  { title: "Celeste", steam: 504230, on: [["steam", 9], ["epic", 0]], ttb: [8, 10, 39], rating: 91, votes: 1500, genres: ["Platform", "Indie"], year: 2018 },
  { title: "Portal 2", steam: 620, on: [["steam", 11]], ttb: [8, 9, 21], rating: 94, votes: 3800, genres: ["Puzzle", "Shooter"], modes: ["Co-operative"], year: 2011 },
  { title: "Elden Ring", steam: 1245620, on: [["steam", 2], ["playstation", 87]], ttb: [55, 60, 133], rating: 94, votes: 2600, genres: ["Role-playing (RPG)", "Action", "Open world"], year: 2022 },
  { title: "Cyberpunk 2077", steam: 1091500, on: [["steam", 0], ["gog", 45]], ttb: [25, 60, 106], rating: 84, votes: 2900, genres: ["Role-playing (RPG)", "Shooter", "Open world"], year: 2020 },
  { title: "Red Dead Redemption 2", steam: 1174180, on: [["steam", 3], ["playstation", 71]], ttb: [50, 80, 180], rating: 93, votes: 3300, genres: ["Adventure", "Shooter", "Open world"], year: 2018 },
  { title: "Baldur's Gate 3", steam: 1086940, on: [["steam", 0]], ttb: [70, 100, 150], rating: 95, votes: 1800, genres: ["Role-playing (RPG)", "Strategy", "Turn-based strategy (TBS)"], year: 2023 },
  { title: "Disco Elysium", steam: 632470, on: [["steam", 0], ["gog", 0], ["epic", 0]], ttb: [21, 32, 64], rating: 92, votes: 1100, genres: ["Role-playing (RPG)", "Adventure"], year: 2019 },
  { title: "Vampire Survivors", steam: 1794680, on: [["steam", 22], ["gamepass", 0]], ttb: [15, 25, 80], rating: 86, votes: 700, genres: ["Roguelike", "Arcade", "Indie"], year: 2022 },
  { title: "Rocket League", steam: 252950, on: [["epic", 140]], ttb: [10, 30, 200], rating: 86, votes: 1600, genres: ["Racing", "Sport"], modes: ["Multiplayer"], year: 2015 },
  { title: "Forza Horizon 5", steam: 1551360, on: [["xbox", 34], ["gamepass", 0]], ttb: [15, 25, 140], rating: 91, votes: 1300, genres: ["Racing", "Open world"], modes: ["Multiplayer"], year: 2021 },
  { title: "Inside", steam: 304430, on: [["steam", 0], ["epic", 0]], ttb: [3, 4, 6], rating: 89, votes: 1400, genres: ["Puzzle", "Platform", "Indie"], year: 2016 },
  { title: "Outer Wilds", steam: 753640, on: [["steam", 4]], ttb: [15, 17, 22], rating: 90, votes: 900, genres: ["Adventure", "Puzzle", "Indie"], year: 2019 },
  { title: "Slay the Spire", steam: 646570, on: [["steam", 48], ["switch", 6]], ttb: [10, 40, 120], rating: 89, votes: 1000, genres: ["Card & Board Game", "Roguelike", "Strategy"], year: 2019 },
  { title: "Dead Cells", steam: 588650, on: [["steam", 0], ["gamepass", 0]], ttb: [12, 20, 90], rating: 89, votes: 1200, genres: ["Roguelike", "Platform", "Action"], year: 2018 },
  { title: "Hi-Fi RUSH", steam: 1817230, on: [["xbox", 6], ["gamepass", 0]], ttb: [10, 12, 30], rating: 88, votes: 500, genres: ["Hack and slash/Beat 'em up", "Music"], year: 2023 },
  { title: "Tetris Effect: Connected", steam: 1003590, on: [["steam", 7], ["xbox", 0]], ttb: [4, 8, 30], rating: 89, votes: 400, genres: ["Puzzle", "Music"], year: 2020 },
  { title: "God of War", steam: 1593500, on: [["playstation", 30]], ttb: [20, 30, 51], rating: 94, votes: 3500, genres: ["Adventure", "Action", "Hack and slash/Beat 'em up"], year: 2018 },
  { title: "Assassin's Creed Valhalla", steam: 2208920, on: [["ubisoft", 18]], ttb: [60, 95, 150], rating: 81, votes: 1200, genres: ["Role-playing (RPG)", "Adventure", "Open world"], year: 2020 },
  { title: "Mario Kart 8 Deluxe", on: [["switch", 52]], ttb: [12, 20, 70], rating: 91, votes: 1300, genres: ["Racing", "Arcade"], modes: ["Multiplayer"], year: 2017 },
  { title: "The Legend of Zelda: Breath of the Wild", on: [["switch", 95]], ttb: [50, 100, 190], rating: 96, votes: 3900, genres: ["Adventure", "Open world"], year: 2017 },
];

export function loadDemo() {
  tx(() => {
    deleteBySource("demo");
    for (const d of DEMO) {
      for (const [platform, hours] of d.on) {
        upsertOwnership({
          platform,
          externalId: `demo-${platform}-${d.title}`,
          title: d.title,
          playtimeMin: H(hours),
          lastPlayed: hours > 0 ? new Date(Date.now() - Math.random() * 200 * 86400_000).toISOString() : null,
          source: "demo",
          meta: {
            title: d.title,
            coverUrl: d.steam ? steamCover(d.steam) : null,
            rating: d.rating,
            ratingCount: d.votes,
            genres: d.genres,
            modes: d.modes ?? ["Single player"],
            ttbHastily: H(d.ttb[0]),
            ttbNormally: H(d.ttb[1]),
            ttbCompletely: H(d.ttb[2]),
            releaseYear: d.year,
          },
        });
      }
    }
  });
  return { count: DEMO.length };
}

export function clearDemo() {
  deleteBySource("demo");
}
