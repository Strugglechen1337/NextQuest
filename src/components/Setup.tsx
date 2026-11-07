"use client";

import { XboxStep } from "./setup/XboxStep";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, runEnrich, type LibraryResponse } from "@/lib/client";
import { A, Field, fmtDate, Guide, Step, type Msg, type StepProps } from "./setup/parts";
import { EpicStep } from "./setup/EpicStep";
import { GogStep } from "./setup/GogStep";
import { Notice } from "./ui";
import { PlayStationStep } from "./setup/PlayStationStep";

export function Setup() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const load = useCallback(async () => setData(await api<LibraryResponse>("/api/library")), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten beim Start laden
    load();
  }, [load]);

  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-white/5" />;
  const s = data.settings;
  const steamOk = !!s["steam.steamId"];
  const gpOk = s["gamepass.enabled"] === "1" && !!s["gamepass.lastSync"];
  const done = [data.igdb, steamOk, gpOk].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">Einrichtung</h1>
        <p className="text-white/60">
          Verbinde deine Plattformen Schritt für Schritt. Alles ist kostenlos, und deine Zugangsdaten bleiben auf
          deinem Server – sie werden nirgendwo hochgeladen.
        </p>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all"
              style={{ width: `${(done / 3) * 100}%` }}
            />
          </div>
          <span className="text-sm text-white/60">{done} von 3 Grundschritten</span>
        </div>
      </header>

      <IgdbStep data={data} reload={load} />
      <SteamStep data={data} reload={load} />
      <GamePassStep data={data} reload={load} />
      <XboxStep data={data} reload={load} />
      <PlayStationStep data={data} reload={load} />
      <GogStep data={data} reload={load} />
      <EpicStep data={data} reload={load} />
      <ComingSoon />
      <DemoStep data={data} reload={load} />

      <div className="text-center">
        <Link href="/" className="btn-primary px-6 py-2.5">
          Zur Bibliothek →
        </Link>
      </div>
      <VersionInfo />
    </div>
  );
}

function VersionInfo() {
  const [v, setV] = useState<{ version: string; commit: string; builtAt: string | null } | null>(null);
  useEffect(() => {
    api<{ version: string; commit: string; builtAt: string | null }>("/api/version").then(setV, () => {});
  }, []);
  if (!v) return null;
  return (
    <p className="text-center text-xs text-white/30">
      NextQuest {v.version} · {v.commit}
      {v.builtAt ? ` · gebaut ${fmtDate(v.builtAt)}` : ""}
    </p>
  );
}

function IgdbStep({ data, reload }: StepProps) {
  const s = data.settings;
  const [clientId, setClientId] = useState(s["igdb.clientId"] ?? "");
  const [secret, setSecret] = useState(s["igdb.clientSecret"] ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [progress, setProgress] = useState<{ done: number; remaining: number } | null>(null);

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/test/igdb", { body: { clientId, clientSecret: secret } });
      setMsg({ kind: "ok", text: "Verbindung klappt – Zugang gespeichert." });
      await reload();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const enrich = async (retry = false) => {
    setBusy(true);
    setMsg(null);
    try {
      await runEnrich((done, remaining) => setProgress({ done, remaining }), retry);
      setMsg({ kind: "ok", text: "Alle Spiele sind auf dem neuesten Stand." });
      await reload();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Step
      id="igdb"
      n={1}
      title="Spieldatenbank (IGDB)"
      subtitle="Cover, Spieldauer, Bewertung & Beliebtheit für alle Plattformen"
      ok={data.igdb}
    >
      <Guide
        steps={[
          <>
            Melde dich mit deinem Twitch-Konto an: <A href="https://dev.twitch.tv/console/apps/create">dev.twitch.tv</A>{" "}
            (kein Twitch-Konto? Kostenlos erstellen; Zwei-Faktor-Anmeldung muss aktiv sein).
          </>,
          <>
            Klicke <b>„Anwendung registrieren“</b>. Name: z. B. <code>NextQuest</code>, OAuth-Redirect-URL:{" "}
            <code>http://localhost</code>, Kategorie: <b>Application Integration</b>, Client-Typ:{" "}
            <b>Vertraulich</b>.
          </>,
          <>
            Öffne die Anwendung über <b>„Verwalten“</b>, kopiere die <b>Client-ID</b> und erzeuge über{" "}
            <b>„Neues Geheimnis“</b> das <b>Client-Secret</b>.
          </>,
          <>Beides unten eintragen und testen.</>,
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client-ID" value={clientId} onChange={setClientId} placeholder="z. B. abcd1234…" />
        <Field label="Client-Secret" value={secret} onChange={setSecret} placeholder="••••••••" secret />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || !clientId || !secret} onClick={test}>
          Testen & speichern
        </button>
        {data.igdb && (
          <>
            <button className="btn-ghost" disabled={busy} onClick={() => enrich(false)}>
              Spieldaten abrufen {data.stats.pendingEnrich ? `(${data.stats.pendingEnrich} offen)` : ""}
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => enrich(true)} title="Nicht gefundene erneut suchen">
              Nicht gefundene erneut suchen
            </button>
          </>
        )}
      </div>
      {progress && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-violet-500 transition-all"
              style={{ width: `${(progress.done / Math.max(progress.done + progress.remaining, 1)) * 100}%` }}
            />
          </div>
          <div className="text-xs text-white/50">
            {progress.done} erledigt, {progress.remaining} offen…
          </div>
        </div>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </Step>
  );
}

function SteamStep({ data, reload }: StepProps) {
  const s = data.settings;
  const [apiKey, setApiKey] = useState(s["steam.apiKey"] ?? "");
  const [profile, setProfile] = useState(s["steam.steamId"] ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const sync = async () => {
    const r = await api<{ count: number }>("/api/sync/steam", { body: {} });
    let text = `${r.count} Steam-Spiele importiert.`;
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
      const r = await api<{ name: string; profilePublic: boolean; gameCount: number; steamId: string }>(
        "/api/test/steam",
        { body: { apiKey, profile } },
      );
      setProfile(r.steamId);
      if (!r.profilePublic || r.gameCount === 0) {
        setMsg({
          kind: "error",
          text: (
            <>
              Hallo {r.name}! Der Zugang klappt, aber Steam zeigt keine Spiele. Stelle in den{" "}
              <A href="https://steamcommunity.com/my/edit/settings">Datenschutzeinstellungen</A> „Mein Profil“ und
              „Spieldetails“ auf <b>Öffentlich</b> und teste erneut.
            </>
          ),
        });
      } else {
        setMsg({ kind: "ok", text: `Hallo ${r.name}! ${r.gameCount} Spiele gefunden – importiere…` });
        await sync();
      }
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
    if (!confirm("Steam trennen und alle Steam-Spiele aus NextQuest entfernen?")) return;
    await api("/api/sync/steam-disconnect", { body: {} });
    setApiKey("");
    setProfile("");
    setMsg(null);
    await reload();
  };

  return (
    <Step
      n={2}
      title="Steam"
      subtitle={
        s["steam.lastSync"]
          ? `Zuletzt synchronisiert: ${fmtDate(s["steam.lastSync"])}`
          : "Alle Steam-Spiele mit deiner Spielzeit"
      }
      ok={!!s["steam.steamId"]}
    >
      <Guide
        steps={[
          <>
            Öffne <A href="https://steamcommunity.com/dev/apikey">steamcommunity.com/dev/apikey</A> und melde dich an.
          </>,
          <>
            Als Domain einfach <code>localhost</code> eintragen, Bedingungen akzeptieren, <b>„Registrieren“</b>. Den
            angezeigten Schlüssel kopieren.
          </>,
          <>
            Stelle in den <A href="https://steamcommunity.com/my/edit/settings">Steam-Datenschutzeinstellungen</A>{" "}
            <b>„Spieldetails“</b> auf <b>Öffentlich</b> – sonst liefert Steam keine Spiele.
          </>,
          <>
            Dein Profil: Link zu deinem Steam-Profil (z. B. <code>steamcommunity.com/id/deinname</code>) oder deine
            17-stellige SteamID.
          </>,
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Steam-API-Key" value={apiKey} onChange={setApiKey} placeholder="32 Zeichen" secret />
        <Field
          label="Steam-Profil"
          value={profile}
          onChange={setProfile}
          placeholder="https://steamcommunity.com/id/…"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || !apiKey || !profile} onClick={test}>
          Testen & importieren
        </button>
        {s["steam.steamId"] && (
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
      {!data.igdb && (
        <div className="text-xs text-white/40">
          Tipp: Richte zuerst die Spieldatenbank (Schritt 1) ein, dann kommen Spieldauer und Bewertungen gleich mit.
        </div>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </Step>
  );
}

function GamePassStep({ data, reload }: StepProps) {
  const s = data.settings;
  const [enabled, setEnabled] = useState(s["gamepass.enabled"] === "1");
  const [catalogs, setCatalogs] = useState<string[]>((s["gamepass.catalogs"] ?? "pc,console").split(","));
  const [market, setMarket] = useState(s["gamepass.market"] ?? "DE");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const save = async () => {
    setBusy(true);
    setMsg({ kind: "info", text: "Lade den aktuellen Game-Pass-Katalog…" });
    try {
      await api("/api/settings", {
        body: { "gamepass.enabled": enabled ? "1" : "0", "gamepass.catalogs": catalogs.join(","), "gamepass.market": market },
      });
      const r = await api<{ count: number }>("/api/sync/gamepass", { body: {} });
      let text = enabled ? `${r.count} Spiele im Game Pass gefunden.` : "Game Pass ausgeschaltet.";
      if (enabled && data.igdb) {
        await runEnrich((done, remaining) =>
          setMsg({ kind: "info", text: `${text} Spieldaten: ${done} erledigt, ${remaining} offen…` }),
        );
        text += " Spieldaten sind geladen.";
      }
      setMsg({ kind: "ok", text });
      await reload();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toggleCatalog = (c: string) =>
    setCatalogs((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  return (
    <Step
      n={3}
      title="Xbox Game Pass"
      subtitle={
        s["gamepass.lastSync"]
          ? `Katalog geladen: ${fmtDate(s["gamepass.lastSync"])}`
          : "Kein Zugang nötig – der Katalog ist öffentlich"
      }
      ok={s["gamepass.enabled"] === "1" && !!s["gamepass.lastSync"]}
    >
      <p className="text-sm text-white/70">
        NextQuest lädt den aktuellen Game-Pass-Katalog direkt von Microsoft. Spiele, die du ohnehin besitzt, bekommen
        ein Game-Pass-Abzeichen, alle anderen kannst du in der Bibliothek ein- oder ausblenden. Fliegt ein Spiel aus
        dem Game Pass, verschwindet es beim nächsten Abgleich automatisch.
      </p>
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 accent-violet-500"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="text-sm">Ich habe ein Game-Pass-Abo</span>
      </label>
      {enabled && (
        <div className="flex flex-wrap items-center gap-2">
          <button className={`chip ${catalogs.includes("pc") ? "chip-on" : ""}`} onClick={() => toggleCatalog("pc")}>
            PC Game Pass
          </button>
          <button
            className={`chip ${catalogs.includes("console") ? "chip-on" : ""}`}
            onClick={() => toggleCatalog("console")}
          >
            Konsole
          </button>
          <select className="input ml-2 w-auto py-1" value={market} onChange={(e) => setMarket(e.target.value)}>
            <option value="DE">Deutschland</option>
            <option value="AT">Österreich</option>
            <option value="CH">Schweiz</option>
            <option value="US">USA</option>
          </select>
        </div>
      )}
      <button className="btn-primary" disabled={busy || (enabled && catalogs.length === 0)} onClick={save}>
        {enabled ? "Speichern & Katalog laden" : "Speichern"}
      </button>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </Step>
  );
}

function ComingSoon() {
  const items = [
    { name: "Ubisoft Connect", note: "Keine Schnittstelle – manuell hinzufügen", color: "#0060e0" },
    { name: "Nintendo Switch", note: "Keine Schnittstelle – manuell hinzufügen", color: "#e60012" },
  ];
  return (
    <Step n={4} title="Weitere Plattformen" subtitle="Folgen in den nächsten Ausbaustufen">
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <div key={i.name} className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
            <span className="h-8 w-1.5 rounded-full" style={{ background: i.color }} />
            <div>
              <div className="text-sm font-medium">{i.name}</div>
              <div className="text-xs text-white/45">{i.note}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-white/60">
        Bis dahin kannst du Spiele dieser Plattformen in der Bibliothek über <b>„＋ Spiel hinzufügen“</b> eintragen –
        sie werden automatisch mit deinen anderen Exemplaren zusammengeführt.
      </p>
    </Step>
  );
}

function DemoStep({ data, reload }: StepProps) {
  const hasDemo = data.games.some((g) => g.ownerships.some((o) => o.source === "demo"));
  const [busy, setBusy] = useState(false);
  const act = async (method: "POST" | "DELETE") => {
    setBusy(true);
    await api("/api/demo", { method, body: method === "POST" ? {} : undefined });
    await reload();
    setBusy(false);
  };
  return (
    <Step n="★" title="Demo-Daten" subtitle="Zum Ausprobieren, ohne etwas einzurichten">
      <p className="text-sm text-white/70">
        25 Beispielspiele auf verschiedenen Plattformen – inklusive doppelter Spiele und Game Pass. Lassen sich
        jederzeit wieder entfernen, ohne deine echten Daten anzufassen.
      </p>
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={busy} onClick={() => act("POST")}>
          {hasDemo ? "Demo-Daten neu laden" : "Demo-Daten laden"}
        </button>
        {hasDemo && (
          <button className="btn-danger" disabled={busy} onClick={() => act("DELETE")}>
            Demo-Daten entfernen
          </button>
        )}
      </div>
    </Step>
  );
}
