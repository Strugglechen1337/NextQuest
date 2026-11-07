"use client";

import { useState } from "react";
import { api, runEnrich } from "@/lib/client";
import { Notice } from "../ui";
import { A, Field, fmtDate, Guide, Step, type Msg, type StepProps } from "./parts";

const GOG_LOGIN_URL =
  "https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2";

export function GogStep({ data, reload }: StepProps) {
  const s = data.settings;
  const connected = !!s["gog.userId"];
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const sync = async () => {
    const r = await api<{ count: number }>("/api/sync/gog", { body: {} });
    let text = `${r.count} GOG-Spiele importiert.`;
    if (data.igdb) {
      setMsg({ kind: "info", text: `${text} Lade Cover & Spieldauer…` });
      await runEnrich((done, remaining) =>
        setMsg({ kind: "info", text: `${text} Spieldaten: ${done} erledigt, ${remaining} offen…` }),
      );
      text += " Spieldaten sind geladen.";
    }
    setMsg({ kind: "ok", text });
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ userId: string; username: string | null; gameCount: number }>("/api/test/gog", {
        body: { code },
      });
      setCode("");
      const greeting = r.username ? `Hallo ${r.username}!` : "GOG-Konto verbunden!";
      setMsg({ kind: "ok", text: `${greeting} ${r.gameCount} Spiele gefunden – importiere…` });
      await sync();
      await reload();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const resync = async () => {
    setBusy(true);
    try {
      await sync();
      await reload();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("GOG trennen und alle GOG-Spiele aus NextQuest entfernen?")) return;
    await api("/api/sync/gog-disconnect", { body: {} });
    setCode("");
    setMsg(null);
    await reload();
  };

  return (
    <Step
      id="gog"
      n="GOG"
      title="GOG"
      subtitle={
        s["gog.lastSync"]
          ? `Zuletzt synchronisiert: ${fmtDate(s["gog.lastSync"])}`
          : "Deine DRM-freie GOG-Bibliothek importieren"
      }
      ok={connected}
    >
      <Guide
        steps={[
          <>
            Öffne das <A href={GOG_LOGIN_URL}>GOG-Anmeldefenster</A> in einem neuen Tab und melde dich mit deinem
            GOG-Konto an.
          </>,
          <>
            Nach der Anmeldung bleibt eine leere weiße Seite stehen – das ist normal! Schau oben in die Adresszeile
            deines Browsers: Dort steht jetzt eine Adresse mit{" "}
            <code>embed.gog.com/on_login_success?origin=client&amp;code=…</code>.
          </>,
          <>
            Kopiere die <b>komplette Internetadresse (URL)</b> aus der Adresszeile (oder nur den Teil hinter{" "}
            <code>code=</code>) und füge sie unten ein.
          </>,
        ]}
      />
      <Field
        label="Weiterleitungs-URL oder GOG-Anmeldecode"
        value={code}
        onChange={setCode}
        placeholder="https://embed.gog.com/on_login_success?origin=client&code=…"
      />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || !code.trim()} onClick={test}>
          Testen & importieren
        </button>
        {connected && (
          <>
            <button className="btn-ghost" disabled={busy} onClick={resync}>
              ↻ Jetzt synchronisieren
            </button>
            <button className="btn-danger" disabled={busy} onClick={disconnect}>
              Trennen
            </button>
          </>
        )}
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </Step>
  );
}
