"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";

export function PlatformPill({ platform, size = "sm" }: { platform: PlatformId; size?: "sm" | "md" }) {
  const p = PLATFORMS[platform] ?? PLATFORMS.other;
  return (
    <span
      title={p.label}
      className={`inline-flex items-center rounded font-semibold text-white ${
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
      style={{ backgroundColor: p.color }}
    >
      {size === "sm" ? p.short : p.label}
    </span>
  );
}

function initials(title: string) {
  return title
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function hue(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Cover({
  src,
  fallbacks = [],
  title,
  className = "",
}: {
  src: string | null;
  /** Weitere Bildquellen, die der Reihe nach probiert werden, wenn ein Bild nicht lädt */
  fallbacks?: string[];
  title: string;
  className?: string;
}) {
  const sources = [src, ...fallbacks].filter((s): s is string => !!s);
  const [index, setIndex] = useState(0);
  const current = sources[index];
  if (!current) {
    const h = hue(title);
    return (
      <div
        className={`grid place-items-center text-3xl font-black text-white/80 ${className}`}
        style={{ background: `linear-gradient(135deg, hsl(${h} 60% 30%), hsl(${(h + 60) % 360} 60% 18%))` }}
      >
        {initials(title)}
      </div>
    );
  }
  return (
    <img
      key={current}
      src={current}
      alt={title}
      loading="lazy"
      onError={() => setIndex((i) => i + 1)}
      // Platzhalter-Bilder (sehr klein) wie fehlende Bilder behandeln
      onLoad={(e) => e.currentTarget.naturalWidth < 20 && setIndex((i) => i + 1)}
      className={`object-cover ${className}`}
    />
  );
}

export function Modal({
  open,
  onClose,
  children,
  wide,
  title,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  title?: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[100dvh] w-full flex-col overflow-hidden border-white/10 bg-[#11141d] shadow-2xl max-sm:h-[100dvh] max-sm:border-t sm:max-h-[min(90dvh,52rem)] sm:rounded-2xl sm:border ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#11141d]/95 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur sm:px-5 sm:py-3.5">
          <div className="min-w-0 flex-1 truncate text-base font-bold sm:text-lg">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80 sm:min-h-9 sm:min-w-9"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <div className="@container flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">{children}</div>

        {footer && (
          <div className="sticky bottom-0 z-20 shrink-0 border-t border-white/10 bg-[#11141d]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-5 sm:py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "error" | "info"; children: ReactNode }) {
  const cls =
    kind === "ok"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : kind === "error"
        ? "border-red-400/30 bg-red-500/10 text-red-200"
        : "border-sky-400/30 bg-sky-500/10 text-sky-200";
  return <div className={`rounded-lg border px-3 py-2 text-sm break-words ${cls}`}>{children}</div>;
}
