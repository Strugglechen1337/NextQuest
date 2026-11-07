"use client";

import { useState } from "react";
import { api, runEnrich } from "@/lib/client";
import { Notice } from "../ui";
import { A, Field, fmtDate, Guide, Step, type Msg, type StepProps } from "./parts";

export function PlayStationStep({ data, reload }: StepProps) {
  const s = data.settings;
  const connected = !!s["psn.refreshExpires"];
  const [npsso, setNpsso] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const sync = async () => {
    const result = await api<{ count: number }>("/api/sync/playstation", { body: {} });
    let text = `${result.count} PlayStation-Spiele importiert.`;
    if (data.igdb) {
      await runEnrich((done, remaining) =>
        setMsg({ kind: "info", text: `${text} Spieldaten: ${done} erledigt, ${remaining} offen…` }),
      );
      text += " Spieldaten sind geladen.";
    }
    setMsg({ kind: "ok", text });
  };

  const act = async (action: "test" | "sync" | "disconnect") => {
    if (action === "disconnect" && !confirm("PlayStation trennen und alle PlayStation-Spiele aus NextQuest entfernen?")) return;
    setBusy(true);
    setMsg({ kind: "info", text: "Bitte warten…" });
    try {
      if (action === "disconnect") {
        await api("/api/sync/playstation-disconnect", { body: {} });
        setNpsso("");
        setMsg(null);
      } else {
        if (action === "test") {
          await api("/api/test/playstation", { body: { npsso } });
          setNpsso("");
        }
        await sync();
      }
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      await reload();
      setBusy(false);
    }
  };

  return (
    <Step id="playstation" n="PS" title="PlayStation"
      subtitle={s["psn.lastSync"] ? `Zuletzt synchronisiert: ${fmtDate(s["psn.lastSync"])}` : "PS4- und PS5-Spiele mit Spielzeit und Cover"}
      ok={connected}>
      <Guide steps={[
        <>Öffne <A href="https://www.playstation.com/">playstation.com</A> und melde dich mit deinem PlayStation-Konto an.</>,
        <>Öffne im selben Browser <A href="https://ca.account.sony.com/api/v1/ssocookie">die Sony-Code-Seite</A>. Kopiere den 64 Zeichen langen Wert hinter <code>npsso</code>. Falls kein Code erscheint, melde dich erneut bei PlayStation an.</>,
        <>Füge den Code unten ein und klicke „Testen & importieren“. Der NPSSO-Code wird nicht gespeichert; die Anmeldung bleibt nur auf deinem Server.</>,
        <>Nach ungefähr 2 Monaten läuft die Anmeldung ab. NextQuest meldet das deutlich; hole dann auf derselben Seite einen neuen NPSSO-Code und trage ihn hier ein.</>,
      ]} />
      <p className="text-sm text-white/60">Importiert werden bereits gestartete PS4- und PS5-Spiele, auch aus PS Plus. Unbenutzte Käufe und ältere Konsolenspiele sind nicht enthalten. PS4- und PS5-Versionen werden zusammengefasst, wenn Sony dieselbe Concept-ID liefert; ihre Spielzeiten werden addiert.</p>
      {connected && <p className="text-xs text-white/50">{s["psn.onlineId"] ? `Verbunden als ${s["psn.onlineId"]}. ` : "Verbunden. "}Anmeldung gültig bis: {fmtDate(s["psn.refreshExpires"])}.</p>}
      <Field label="NPSSO-Code" value={npsso} onChange={setNpsso} placeholder="64 Zeichen (nur bei Einrichtung oder erneuter Anmeldung nötig)" secret />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || !npsso.trim()} onClick={() => act("test")}>Testen & importieren</button>
        {connected && <>
          <button className="btn-ghost" disabled={busy} onClick={() => act("sync")}>↻ Jetzt synchronisieren</button>
          <button className="btn-danger" disabled={busy} onClick={() => act("disconnect")}>Trennen</button>
        </>}
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </Step>
  );
}
