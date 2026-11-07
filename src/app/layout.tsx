import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NextQuest",
  description: "Alle Spielebibliotheken an einem Ort – was spiele ich als Nächstes?",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0d14]/85 backdrop-blur">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-emerald-400 text-sm text-black">
                NQ
              </span>
              NextQuest
            </Link>
            <div className="flex gap-1 text-sm">
              <Link href="/" className="rounded-md px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white">
                Bibliothek
              </Link>
              <Link href="/setup" className="rounded-md px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white">
                Einrichtung
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
