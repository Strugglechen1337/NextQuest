import { Library } from "@/components/Library";

export default function Home() {
  return <><form action="/check" className="mb-6 flex min-w-0 flex-col gap-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 sm:flex-row sm:items-center"><label htmlFor="home-check" className="font-bold">Hab ich das schon?</label><input id="home-check" name="q" required placeholder="Spielname oder Store-Link" className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/20 bg-black/20 px-3 outline-none focus:border-violet-400" /><button className="min-h-11 rounded-lg bg-violet-500 px-5 font-semibold hover:bg-violet-400">Prüfen</button></form><Library /></>;
}
