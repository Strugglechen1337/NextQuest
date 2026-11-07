import { Suspense } from "react";
import { Check } from "@/components/Check";
async function CheckContent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <Check initialQuery={typeof q === "string" ? q : ""} />;
}
export default function CheckPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <Suspense fallback={<p>Wird geladen …</p>}><CheckContent searchParams={searchParams} /></Suspense>;
}
