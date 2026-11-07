import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#0b0d14",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "NextQuest",
  description: "Alle Spielebibliotheken an einem Ort – was spiele ich als Nächstes?",
  applicationName: "NextQuest",
  appleWebApp: {
    capable: true,
    title: "NextQuest",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="flex min-h-dvh w-full max-w-full flex-col overflow-x-hidden">
        <AppNav />
        <main className="app-container main-with-bottom-nav min-w-0 flex-1 pt-[var(--space-page-y)]">{children}</main>
      </body>
    </html>
  );
}
