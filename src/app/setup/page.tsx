import type { Metadata } from "next";
import { Setup } from "@/components/Setup";

export const metadata: Metadata = { title: "Einrichtung · NextQuest" };

export default function SetupPage() {
  return <Setup />;
}
