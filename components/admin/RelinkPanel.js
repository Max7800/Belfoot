"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Reliaison SANS appel API : performances de match sans joueur et matchs sans
// club. L'aperçu parcourt tous les lots sans rien écrire ; l'application exige la
// saisie de « RELIER » et chaque lien posé est journalisé côté serveur (audit_log).
async function relinkRequest(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session administrateur expirée.");
  const response = await fetch("/api/admin/data-maintenance", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "La reliaison a échoué.");
  return result;
}

const EMPTY = { scanned: 0, linkable: 0, linked: 0, unresolved: 0, ambiguous: 0, noExternalId: 0, providerLeagues: {}, batches: 0 };

export default function RelinkPanel() {
  const [competitions, setCompetitions] = useState([]);
  const [target, setTarget] = useState("performances");
  const [competitionId, setCompetitionId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.from("competitions").select("id,name").order("name").then(({ data }) => setCompetitions(data || []));
  }, []);

  const run = async (apply) => {
    if (target === "matches" && !competitionId) { setMessage("Choisis la compétition à réparer."); return; }
    setStatus(apply ? "applying" : "previewing"); setMessage(""); setReport(null);
    const totals = { ...EMPTY, providerLeagues: {} };
    let afterId = null;
    try {
      for (;;) {
        const result = await relinkRequest({ action: apply ? "relink-apply" : "relink-preview", target, competitionId: competitionId || null, afterId, confirmation: apply ? confirmation : undefined });
        totals.batches++;
        for (const key of ["scanned", "linkable", "unresolved", "ambiguous", "noExternalId"]) totals[key] += Number(result[key]) || 0;
        if (apply) totals.linked += Number(result.links) || 0;
        for (const [league, count] of Object.entries(result.providerLeagues || {})) totals.providerLeagues[league] = (totals.providerLeagues[league] || 0) + count;
        if (result.competition) totals.competition = result.competition;
        setReport({ ...totals, apply });
        if (result.done || !result.nextAfterId) break;
        afterId = result.nextAfterId;
      }
      setStatus("done");
    } catch (error) {
      setStatus("error"); setMessage(error.message);
    }
  };

  const busy = status === "previewing" || status === "applying";
  return (
    <div className="mb-4 rounded-xl border border-sky-400/20 bg-sky-400/[0.05] p-3">
      <b className="text-sm text-sky-200">Reliaison sans appel API</b>
      <p className="mt-1 text-xs text-muted">Relie les performances sans joueur et les matchs sans club à partir des identifiants déjà enregistrés. L’aperçu n’écrit rien ; seules les valeurs vides sont remplies et chaque lien est journalisé.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1 text-muted">Cible
          <select value={target} onChange={(event) => { setTarget(event.target.value); setReport(null); }} disabled={busy} className="rounded border border-line/10 bg-surface2 px-2 py-1 text-content">
            <option value="performances">Performances sans joueur</option>
            <option value="matches">Matchs sans club</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-muted">Compétition {target === "performances" ? "(facultatif)" : "(obligatoire)"}
          <select value={competitionId} onChange={(event) => { setCompetitionId(event.target.value); setReport(null); }} disabled={busy} className="max-w-xs rounded border border-line/10 bg-surface2 px-2 py-1 text-content">
            <option value="">{target === "performances" ? "Toutes" : "Choisir…"}</option>
            {competitions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => run(false)} disabled={busy} className="rounded-lg border border-line/15 px-3 py-1.5 font-bold">{status === "previewing" ? "Analyse…" : "Analyser (aperçu)"}</button>
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Recopie RELIER" disabled={busy} className="w-32 rounded border border-line/10 bg-surface2 px-2 py-1" />
        <button type="button" onClick={() => run(true)} disabled={busy || confirmation !== "RELIER" || !report || report.apply} className="rounded-lg bg-accent px-3 py-1.5 font-bold text-white disabled:opacity-40">{status === "applying" ? "Reliaison…" : "Relier"}</button>
      </div>
      {message && <p className="mt-2 text-xs text-red-300">{message}</p>}
      {report && <div className="mt-3 rounded-lg border border-line/10 bg-bg/40 p-2 text-xs">
        <div>{report.apply ? "Appliqué" : "Aperçu"} · {report.batches} lot(s) · examinées {report.scanned}{target === "matches" ? ` (côtés vides ${report.linkable + report.unresolved + report.ambiguous + report.noExternalId})` : ""}</div>
        <div>Réparables : <b>{report.linkable}</b> · sans fiche correspondante : {report.unresolved} · ambiguës (ignorées) : {report.ambiguous}{target === "matches" ? ` · sans identifiant : ${report.noExternalId}` : ""}{report.apply ? ` · reliées : ${report.linked}` : ""}</div>
        {report.competition && <div className="mt-1 text-muted">Compétition : {report.competition.name} · identifiant API {report.competition.externalId} · nom provider « {report.competition.providerName || "?"} »</div>}
        {Object.keys(report.providerLeagues).length > 0 && <div className="mt-1 text-amber-200">Ligues API des matchs : {Object.entries(report.providerLeagues).map(([league, count]) => `${league} (${count})`).join(" · ")} — vérifier qu’elles correspondent bien à la compétition avant de relier.</div>}
      </div>}
    </div>
  );
}
