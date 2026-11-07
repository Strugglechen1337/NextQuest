import type { Metadata } from "next";
import { YearReview } from "@/components/YearReview";

export const metadata: Metadata = { title: "Jahresrückblick · NextQuest" };

export default function YearReviewPage() {
  return <YearReview />;
}
