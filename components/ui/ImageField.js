"use client";
import { useState } from "react";
import { uploadImage } from "@/lib/media";

export default function ImageField({ value, onChange, uploadScope = "admin" }) {
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const f = e.target.files?.[0]; if (!f) return; setBusy(true);
    try {
      onChange(await uploadImage(f, { scope: uploadScope }));
    } catch (err) { alert("Upload impossible : " + err.message); }
    setBusy(false); e.target.value = "";
  }
  return (
    <div className="space-y-2">
      {value && <img src={value} alt="" className="h-24 rounded-lg object-cover" />}
      <div className="flex items-center gap-2">
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} className="text-xs" />
        {busy && <span className="text-xs text-muted">…</span>}
        {value && <button type="button" onClick={() => onChange("")} className="text-xs text-red-400">retirer</button>}
      </div>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="ou coller une URL" className="w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-xs" />
    </div>
  );
}
