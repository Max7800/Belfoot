"use client";
import { useEffect, useState } from "react";
import { listCategories } from "@/lib/categories";

export default function CategoryField({ scope, value, onChange }) {
  const [cats, setCats] = useState([]);
  useEffect(() => { listCategories(scope, { activeOnly: true }).then(setCats).catch(() => {}); }, [scope]);
  const cur = cats.find((c) => c.name === value);
  return (
    <div className="flex items-center gap-2">
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="rounded border border-line/10 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent">
        <option value="">—</option>
        {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
      </select>
      {cur && <span className="h-4 w-4 rounded-full" style={{ background: cur.color }} />}
    </div>
  );
}
