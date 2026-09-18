"use client";
import { useEffect, useState } from "react";
import { listContributions, reviewContribution } from "@/lib/contributions";

export default function ContributionsQueue() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const load = () => listContributions("pending").then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const act = async (c, action) => {
    setBusy(c.id); setError("");
    const note = action === "reject" ? (prompt("Motif du refus (optionnel) :") || "") : "";
    try { await reviewContribution(c.id, action, note); await load(); }
    catch (e) { setError(e.message); }
    setBusy(null);
  };
  return (
    <div>
      <h2 className="mb-4 text-lg font-bold">Contributions <span className="text-sm font-normal text-muted">({items.length} en attente)</span></h2>
      <p className="mb-4 text-sm text-muted">Une nouvelle contribution acceptée est créée en brouillon. Vérifie tout le contenu ci-dessous avant de la publier depuis sa collection.</p>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="rounded-xl border border-line/10 bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm"><span className="font-semibold">{c.payload?.title || "(sans titre)"}</span>
                <span className="ml-2 text-xs text-muted">{c.collection} · {c.kind === "edit" ? "correction" : "nouveau"}</span></div>
              <div className="text-xs text-muted">{new Date(c.submitted_at).toLocaleString()}</div>
            </div>
            {c.payload?.excerpt && <p className="mt-1 text-sm text-muted">{c.payload.excerpt}</p>}
            <details className="mt-3 rounded-lg border border-line/10 bg-surface2 p-3">
              <summary className="cursor-pointer text-sm font-semibold">Relire tous les champs</summary>
              <dl className="mt-3 space-y-3">
                {Object.entries(c.payload || {}).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs font-bold uppercase tracking-wide text-muted">{key}</dt>
                    <dd className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <div className="mt-3 flex gap-2">
              <button disabled={!!busy} onClick={() => act(c, "approve")} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white disabled:opacity-50">{busy === c.id ? "Traitement…" : "Accepter en brouillon"}</button>
              <button disabled={!!busy} onClick={() => act(c, "reject")} className="rounded border border-line/20 px-3 py-1 text-sm text-muted hover:text-content disabled:opacity-50">Refuser</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted">Aucune contribution en attente.</p>}
      </div>
    </div>
  );
}
