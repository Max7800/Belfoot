"use client";
import { useState } from "react";
import { getCollection } from "@/config/collections";
import { submitContribution } from "@/lib/contributions";
import { useAuth } from "@/lib/auth";
import FieldInput from "@/components/admin/FieldInput";

const COLUMN = { title: "title", slug: "slug", excerpt: "excerpt", body: "body", cover: "cover_url", images: "images", category: "category", seo: "seo" };

export default function ContributeForm({ collectionKey }) {
  const col = getCollection(collectionKey);
  const { session } = useAuth();
  const [row, setRow] = useState({ data: {}, seo: {}, images: [] });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!col) return null;
  const fields = Object.entries(col.fields || {}).filter(([k, f]) => k !== "published" && f.type !== "bool" && f.type !== "slug");
  const getV = (k) => (COLUMN[k] ? row[COLUMN[k]] : row.data?.[k]);
  const setV = (k, v) => setRow((r) => (COLUMN[k] ? { ...r, [COLUMN[k]]: v } : { ...r, data: { ...(r.data || {}), [k]: v } }));
  if (!session) return <p className="text-muted">Connecte-toi pour proposer un contenu.</p>;
  if (done) return <p className="text-green-500">Merci ! Ta proposition a été envoyée pour validation.</p>;
  const submit = async () => {
    setBusy(true);
    const payload = {};
    for (const [k] of fields) { const v = getV(k); if (v !== undefined && v !== "") payload[k] = v; }
    try { await submitContribution({ collection: collectionKey, kind: "create", payload }); setDone(true); }
    catch (e) { alert(e.message); }
    setBusy(false);
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-black">Proposer — {col.labelSingular || col.label}</h1>
      {fields.map(([k, f]) => <FieldInput key={k} field={f} scope={col.key} value={getV(k)} onChange={(v) => setV(k, v)} />)}
      <button disabled={busy} onClick={submit} className="rounded bg-accent px-4 py-2 text-sm font-bold text-white">Envoyer la proposition</button>
    </div>
  );
}
