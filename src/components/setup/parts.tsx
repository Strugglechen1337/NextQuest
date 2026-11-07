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
      <div className="flex items-center gap-4 border-b border-white/10 p-5">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${
            ok ? "bg-emerald-500 text-black" : "bg-white/10 text-white/70"
          }`}
        >
          {ok ? "✓" : n}
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-white/50">{subtitle}</p>
        </div>
        {ok && (
          <span className="ml-auto rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300">
            Verbunden
          </span>
        )}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

export function Guide({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-2 text-sm text-white/70">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-500/25 text-[11px] font-bold text-violet-200">
            {i + 1}
          </span>
          <span>{s}</span>
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
    <label className="block space-y-1">
      <span className="text-xs text-white/50">{label}</span>
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
  <a href={href} target="_blank" rel="noreferrer" className="text-violet-300 underline hover:text-violet-200">
    {children}
  </a>
);

export interface StepProps {
  data: LibraryResponse;
  reload: () => Promise<void>;
}
