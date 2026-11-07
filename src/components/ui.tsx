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

export function Cover({ src, title, className = "" }: { src: string | null; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
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
      src={src}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}

export function Modal({
  open,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className={`card relative w-full ${wide ? "max-w-3xl" : "max-w-lg"} bg-[#11141d] p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md px-2 py-1 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Schließen"
        >
          ✕
        </button>
        {children}
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
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
