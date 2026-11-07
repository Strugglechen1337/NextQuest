"use client";

import type { ReactNode } from "react";
import type { LibraryResponse } from "@/lib/client";

export type Msg = { kind: "ok" | "error" | "info"; text: ReactNode } | null;

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

export function Step({
  id,
  n,
  title,
  subtitle,
  ok,
  children,
}: {
  id?: string;
  n: number | string;
  title: string;
  subtitle: string;
  ok?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-20 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3.5 sm:gap-4 sm:p-5">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${
            ok ? "bg-emerald-500 text-black" : "bg-white/10 text-white/75"
          }`}
        >
          {ok ? "✓" : n}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[clamp(0.95rem,1.3vw,1.05rem)] font-semibold leading-snug break-words">{title}</h2>
          <p className="text-xs text-white/55 break-words sm:text-sm">{subtitle}</p>
        </div>
        {ok && (
          <span className="ml-auto shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
            Verbunden
          </span>
        )}
      </div>
      <div className="space-y-4 p-3.5 sm:p-5">{children}</div>
    </section>
  );
}

export function Guide({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-2.5 text-sm leading-relaxed text-white/75">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5 sm:gap-3">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-500/25 text-[11px] font-bold text-violet-200">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  secret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="text-xs font-medium text-white/60">{label}</span>
      <input
        className="input font-mono"
        type={secret ? "password" : "text"}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => secret && value.startsWith("••••") && e.target.select()}
        placeholder={placeholder}
      />
    </label>
  );
}

export const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="text-violet-300 underline hover:text-violet-200 break-words [overflow-wrap:anywhere]"
  >
    {children}
  </a>
);

export interface StepProps {
  data: LibraryResponse;
  reload: () => Promise<void>;
}
