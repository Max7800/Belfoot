"use client";
import { useState } from "react";
import { uploadImage } from "@/lib/media";

export default function GalleryField({ value, onChange }) {
  const imgs = Array.isArray(value) ? value : [];
  const [busy, setBusy] = useState(false);
  async function add(e) {
    const files = [...(e.target.files || [])]; if (!files.length) return; setBusy(true);
    const urls = [...imgs];
    for (const f of files) {
      try {
        urls.push(await uploadImage(f));
      } catch (err) { alert("Upload : " + err.message); }
    }
    onChange(urls); setBusy(false); e.target.value = "";
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {imgs.map((u, i) => (
          <div key={i} className="relative">
            <img src={u} alt="" className="h-16 w-16 rounded object-cover" />
            <button type="button" onClick={() => onChange(imgs.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="file" accept="image/*" multiple onChange={add} className="text-xs" />
        {busy && <span className="text-xs text-muted">…</span>}
      </div>
    </div>
  );
}
