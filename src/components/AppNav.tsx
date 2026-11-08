"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function AppNav() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => { if (process.env.NEXT_PUBLIC_DEMO === "1") return; fetch("/api/update").then(r => r.json()).then(data => setUpdateAvailable(data.available === true)).catch(() => {}); }, []);
  const pathname = usePathname();
  const isSetup = pathname?.startsWith("/setup") ?? false;
  const isStats = pathname?.startsWith("/stats") ?? false;
  const isLibrary = !isSetup && !isStats;

  return (
    <>
      {process.env.NEXT_PUBLIC_DEMO === "1" && <div className="bg-violet-500/20 px-4 py-2 text-center text-sm">Demo · Daten bleiben in diesem Browser <button className="ml-3 underline" onClick={async () => { const { resetDemo } = await import("@/lib/demo-backend"); resetDemo(); window.location.reload(); }}>Demo zurücksetzen</button></div>}
      <header className="site-header sticky top-0 z-30 border-b border-white/10 bg-[#0b0d14]/90 backdrop-blur-md">
        <nav
          className="app-container flex min-h-13 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 sm:justify-start sm:gap-6 sm:py-3"
          aria-label="Hauptnavigation"
        >
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-lg text-[clamp(1rem,1.4vw,1.15rem)] font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-emerald-400 text-sm font-black text-black shadow-sm shadow-violet-500/25">
              NQ
            </span>
            <span>NextQuest</span>
          </Link>

          <div className="desktop-top-nav min-w-0 flex-wrap items-center gap-1.5 text-sm">
            <Link
              href="/"
              aria-current={isLibrary ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80 ${
                isLibrary
                  ? "border-violet-400/40 bg-violet-500/20 text-white"
                  : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <svg className="h-4 w-4 opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              Bibliothek
            </Link>
            <Link
              href="/stats"
              aria-current={isStats ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80 ${
                isStats
                  ? "border-violet-400/40 bg-violet-500/20 text-white"
                  : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <svg className="h-4 w-4 opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 20V11M10 20V5M16 20v-8M21 20H3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Statistik
            </Link>
            <Link
              href="/setup"
              aria-current={isSetup ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80 ${
                isSetup
                  ? "border-violet-400/40 bg-violet-500/20 text-white"
                  : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <svg className="h-4 w-4 opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" strokeLinecap="round" />
              </svg>
              Einrichtung {updateAvailable && <span aria-label="Update verfügbar" title="Update verfügbar" className="h-2 w-2 rounded-full bg-emerald-400" />}
            </Link>
          </div>
        </nav>
      </header>

      <nav
        aria-label="Mobile Navigation"
        className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0d14]/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-lg"
      >
        <Link
          href="/"
          aria-current={isLibrary ? "page" : undefined}
          className={`flex min-h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/80 ${
            isLibrary ? "text-white" : "text-white/60 hover:text-white"
          }`}
        >
          <span
            className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
              isLibrary ? "bg-violet-500/25 text-violet-300" : ""
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </span>
          <span>Bibliothek</span>
        </Link>

        <Link
          href="/stats"
          aria-current={isStats ? "page" : undefined}
          className={`flex min-h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/80 ${
            isStats ? "text-white" : "text-white/60 hover:text-white"
          }`}
        >
          <span
            className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
              isStats ? "bg-violet-500/25 text-violet-300" : ""
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 20V11M10 20V5M16 20v-8M21 20H3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>Statistik</span>
        </Link>

        <Link
          href="/setup"
          aria-current={isSetup ? "page" : undefined}
          className={`flex min-h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/80 ${
            isSetup ? "text-white" : "text-white/60 hover:text-white"
          }`}
        >
          <span
            className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
              isSetup ? "bg-violet-500/25 text-violet-300" : ""
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" strokeLinecap="round" />
            </svg>
          </span>
          <span>Einrichtung {updateAvailable && <span aria-label="Update verfügbar" title="Update verfügbar" className="inline-block h-2 w-2 rounded-full bg-emerald-400" />}</span>
        </Link>
      </nav>
    </>
  );
}
