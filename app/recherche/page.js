"use client";
import { useState } from "react";
import Link from "next/link";
import { searchAll, searchTypes } from "@/lib/search";

export default function SearchPage() {
  const types = searchTypes();
  const [q, setQ] = useState("");
  const [active, setActive] = useState([]);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const run = async (query, filt = active) => {
    if (!query.trim()) { setResults([]); return; }
    setBusy(true); setTouched(true);
    setResults(await searchAll(query, { types: filt }));
    setBusy(false);
  };
  const toggle = (t) => { const next = active.includes(t) ? active.filter((x) => x !== t) : [...active, t]; setActive(next); run(q, next); };

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); run(q); }} className="mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Rechercher…" className="w-full rounded-xl border border-line/10 bg-surface px-4 py-3 outline-none focus:border-accent" />
      </form>
      <div className="mb-5 flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t.key} onClick={() => toggle(t.key)} className={`rounded-full border px-3 py-1 text-xs ${active.includes(t.key) ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted hover:text-content"}`}>{t.label}</button>
        ))}
      </div>
      {busy && <p className="text-muted">Recherche…</p>}
      <div className="space-y-2">
        {results.map((r) => (
          <Link key={r.type + r.id} href={r.url} className="block rounded-xl border border-line/10 bg-surface p-3 transition hover:border-accent/40">
            <div className="flex items-center gap-2">
              <span className="rounded bg-surface2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">{r.typeLabel}</span>
              <span className="font-semibold">{r.title}</span>
            </div>
            {r.subtitle && <p className="mt-1 line-clamp-1 text-sm text-muted">{r.subtitle}</p>}
          </Link>
        ))}
        {touched && !busy && q.trim() && results.length === 0 && <p className="text-muted">Aucun résultat.</p>}
      </div>
    </div>
  );
}
