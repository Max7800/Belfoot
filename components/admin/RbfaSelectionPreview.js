"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Lecture seule : les propositions restent à vérifier avant toute modification.
export default function RbfaSelectionPreview() {
  const [category, setCategory] = useState("senior");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function compare() {
    setBusy(true); setError(""); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session administrateur expirée.");
      const response = await fetch(`/api/admin/rbfa-selection-preview?category=${encodeURIComponent(category)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `Comparaison impossible (HTTP ${response.status}).`);
      setResult(data);
    } catch (failure) { setError(failure.message || "Comparaison impossible."); }
    finally { setBusy(false); }
  }

  return <section className="mb-4 rounded-xl border border-line/10 bg-surface/60 p-3">
    <h3 className="text-sm font-bold">Sélections belges · comparaison RBFA</h3>
    <p className="mt-1 text-xs text-muted">Compare les joueurs avec la page de la fédération. Aucun joueur n’est ajouté ou retiré et aucun appel API-Football n’est consommé.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <select aria-label="Sélection belge" value={category} disabled={busy} onChange={(event) => { setCategory(event.target.value); setResult(null); }} className="rounded border border-line/10 bg-surface2 px-2 py-1.5 text-sm">
        <option value="senior">Diables Rouges</option><option value="u21">Belgique U21</option>
      </select>
      <button type="button" disabled={busy} onClick={compare} className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-sm font-bold disabled:opacity-50">{busy ? "Comparaison…" : "Comparer avec la RBFA"}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
    {result && <div aria-live="polite" className="mt-3 space-y-2 text-xs leading-5">
      <p><b>{result.officialCount}</b> joueurs sur la page RBFA · <b>{result.matched.length}</b> correspondance(s) candidate(s) · <b>{result.unresolved.length}</b> identité(s) à vérifier.</p>
      <p className="text-muted">La date de l’annonce n’est pas connue ; les noms proposés ne sont pas une validation officielle de correspondance. <a className="underline" href={result.source} target="_blank" rel="noreferrer">Voir la source RBFA</a></p>
      {!!result.additions.length && <p><b>Présents dans la source, absents de Belfoot :</b> {result.additions.map((row) => row.official.name).join(", ")}.</p>}
      {!!result.unresolved.length && <p className="text-amber-300"><b>À identifier :</b> {result.unresolved.map((row) => row.name).join(", ")}.</p>}
      {result.removalCandidates === null ? <p className="text-muted">Les absences ne sont pas calculées tant que toutes les identités ne sont pas résolues.</p> : !!result.removalCandidates.length && <p><b>Présents sur Belfoot, absents de la source :</b> {result.removalCandidates.map((row) => row.name).join(", ")}.</p>}
    </div>}
  </section>;
}
