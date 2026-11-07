"use client";

import { useState } from "react";
import { api, runEnrich } from "@/lib/client";
import { Notice } from "../ui";
import { A, Field, fmtDate, Guide, Step, type Msg, type StepProps } from "./parts";

const EPIC_LOGIN_URL =
  "https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a02cf8f4414e29b15921876da36f9a%26responseType%3Dcode";

export function EpicStep({ data, reload }: StepProps) {
  const s = data.settings;
  const connected = !!s["epic.accountId"];
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const sync = async () => {
    const r = await api<{ count: number }>("/api/sync/epic", { body: {} });
    let text = `${r.count} Epic-Games-Spiele importiert.`;
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
      const r = await api<{ accountId: string; displayName: string; gameCount: number }>("/api/test/epic", {
        body: { code },
      });
      setCode("");
      setMsg({
        kind: "ok",
        text: `Hallo ${r.displayName}! Konto verbunden (${r.gameCount} Bibliothekseinträge) – importiere Spiele…`,
      });
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
    if (!confirm("Epic Games trennen und alle Epic-Games-Spiele aus NextQuest entfernen?")) return;
    await api("/api/sync/epic-disconnect", { body: {} });
    setCode("");
    setMsg(null);
    await reload();
  };

  const subtitle = s["epic.lastSync"]
    ? `Zuletzt synchronisiert: ${fmtDate(s["epic.lastSync"])}${s["epic.displayName"] ? ` (${s["epic.displayName"]})` : ""}`
    : "Alle gekauften und kostenlos gesicherten Epic-Games-Spiele";

  return (
    <Step id="epic" n="Epic" title="Epic Games" subtitle={subtitle} ok={connected}>
      <Guide
        steps={[
          <>
            Öffne die <A href={EPIC_LOGIN_URL}>Epic-Games-Anmeldung</A> in einem neuen Tab und melde dich mit deinem
            Epic-Games-Konto an.
          </>,
          <>
            Nach der Anmeldung zeigt dein Browser eine kurze Textseite im JSON-Format an, in der{" "}
            <code>&quot;authorizationCode&quot;: &quot;…&quot;</code> steht.
          </>,
          <>
            Kopiere entweder den <b>kompletten angezeigten Text</b> (z. B. mit <code>Strg+A</code> und{" "}
            <code>Strg+C</code>) oder nur den 32-stelligen Code hinter <code>authorizationCode</code> und füge ihn unten
            ein.
          </>,
        ]}
      />
      <Field
        label="authorizationCode oder komplettes JSON"
        value={code}
        onChange={setCode}
        placeholder='{"redirectUrl":"…","authorizationCode":"…"} oder 32-stelliger Code'
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
