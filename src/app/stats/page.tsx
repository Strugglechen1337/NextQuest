import type { Metadata } from "next";
import { Stats } from "@/components/Stats";

export const metadata: Metadata = { title: "Statistik · NextQuest" };

export default function StatsPage() {
  return <Stats />;
}
