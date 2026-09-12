"use client";
import { useEffect, useState } from "react";
import { listContributions, reviewContribution } from "@/lib/contributions";

export default function ContributionsQueue() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => listContributions("pending").then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const act = async (c, action) => {
    setBusy(true);
    const note = action === "reject" ? (prompt("Motif du refus (optionnel) :") || "") : "";
    try { await reviewContribution(c, action, note); } catch (e) { alert(e.message); }
    setBusy(false); load();
  };
  return (
    <div>
      <h2 className="mb-4 text-lg font-bold">Contributions <span className="text-sm font-normal text-muted">({items.length} en attente)</span></h2>
      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="rounded-xl border border-line/10 bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm"><span className="font-semibold">{c.payload?.title || "(sans titre)"}</span>
                <span className="ml-2 text-xs text-muted">{c.collection} · {c.kind === "edit" ? "correction" : "nouveau"}</span></div>
              <div className="text-xs text-muted">{new Date(c.submitted_at).toLocaleString()}</div>
            </div>
            {c.payload?.excerpt && <p className="mt-1 text-sm text-muted">{c.payload.excerpt}</p>}
            <div className="mt-3 flex gap-2">
              <button disabled={busy} onClick={() => act(c, "approve")} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">Accepter</button>
              <button disabled={busy} onClick={() => act(c, "reject")} className="rounded border border-line/20 px-3 py-1 text-sm text-muted hover:text-content">Refuser</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted">Aucune contribution en attente.</p>}
      </div>
    </div>
  );
}
