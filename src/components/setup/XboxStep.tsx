"use client";

import { useState } from "react";
import { api, runEnrich } from "@/lib/client";
import { Notice } from "../ui";
import { A, Field, fmtDate, Guide, Step, type Msg, type StepProps } from "./parts";

export function XboxStep({ data, reload }: StepProps) {
  const s = data.settings;
  const [apiKey, setApiKey] = useState(s["xbox.apiKey"] ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const sync = async () => {
    const r = await api<{ count: number; playtimeCount: number; warning?: string }>("/api/sync/xbox", { body: {} });
    let text = `${r.count} Xbox-Spiele importiert; für ${r.playtimeCount} Spiele ist Spielzeit verfügbar.`;
    if (data.igdb) {
      await runEnrich((done, remaining) => setMsg({ kind: "info", text: `${text} Spieldaten: ${done} erledigt, ${remaining} offen…` }));
      text += " Spieldaten sind geladen.";
    }
    setMsg({ kind: r.warning ? "info" : "ok", text: r.warning ? `${text} ${r.warning}` : text });
  };
  const act = async (test: boolean) => {
    setBusy(true);
    setMsg({ kind: "info", text: "Verbinde mit OpenXBL…" });
    try {
      if (test) {
        await api("/api/test/xbox", { body: { apiKey } });
        // Replace the entered secret with the server's masked value immediately.
        const library = await api<{ settings: Record<string, string | null> }>("/api/library");
        setApiKey(library.settings["xbox.apiKey"] ?? "");
      }
      await sync();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      await reload();
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!confirm("Xbox trennen und alle Xbox-Spiele aus NextQuest entfernen?")) return;
    setBusy(true);
    try {
      await api("/api/sync/xbox-disconnect", { body: {} });
      setApiKey("");
      setMsg(null);
      await reload();
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  return (
    <Step id="xbox" n="Xbox" title="Xbox – eigene Spiele" ok={!!s["xbox.xuid"]}
      subtitle={s["xbox.lastSync"] ? `Zuletzt synchronisiert: ${fmtDate(s["xbox.lastSync"])}` : "Gestartete Xbox-Spiele über OpenXBL importieren"}>
      <Guide steps={[
        <>Öffne <A href="https://xbl.io">xbl.io</A> und melde dich dort mit dem Microsoft-Konto an, mit dem du Xbox spielst. OpenXBL ist ein unabhängiger Dienst und erhält dabei Zugriff auf deine Xbox-Daten.</>,
        <>Kopiere im OpenXBL-Dashboard deinen persönlichen <b>API-Key</b> (für <code>X-Authorization</code>). Dein Microsoft-Passwort wird hier nicht benötigt. Hilfe: <A href="https://xbl.io/docs">OpenXBL-Dokumentation</A>.</>,
        <>Füge den Schlüssel unten ein und klicke <b>„Testen & importieren“</b>. Dein Gamertag wird automatisch erkannt. Bei abgelaufener Xbox-Anmeldung melde dich auf xbl.io erneut an und kopiere den aktuellen Schlüssel.</>,
        <>Die Titel-Historie enthält nur Spiele, die du mindestens einmal gestartet hast. Gekaufte, nie gestartete Spiele fehlen; auch gestartete Abo-, Disc- und kostenlose Spiele können enthalten sein. Dies ist kein Nachweis deiner Käufe.</>,
        <>Der kostenlose OpenXBL-Tarif hat ein Anfragelimit. Synchronisiere bei Bedarf; Spielzeiten werden gesammelt abgefragt, sind aber nicht für jedes Spiel verfügbar. Bei gesperrten Daten prüfe <A href="https://account.xbox.com/settings">deine Xbox-Datenschutzeinstellungen</A>.</>,
      ]} />
      {s["xbox.gamertag"] && <p className="text-sm text-white/70">Verbunden als {s["xbox.gamertag"]}</p>}
      <Field label="Persönlicher OpenXBL-API-Key" value={apiKey} onChange={setApiKey} secret />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || !apiKey.trim()} onClick={() => act(true)}>Testen & importieren</button>
        {s["xbox.xuid"] && <>
          <button className="btn-ghost" disabled={busy} onClick={() => act(false)}>↻ Jetzt synchronisieren</button>
          <button className="btn-danger" disabled={busy} onClick={disconnect}>Trennen</button>
        </>}
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </Step>
  );
}
