"use client";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

export default function CollapsibleSection({ id, title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { try { const v = localStorage.getItem("sec:" + id); if (v != null) setOpen(v === "1"); } catch {} }, [id]);
  const toggle = () => setOpen((o) => { const n = !o; try { localStorage.setItem("sec:" + id, n ? "1" : "0"); } catch {} return n; });
  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-line/10 bg-surface">
      <button onClick={toggle} className="flex w-full items-center justify-between p-4 text-left">
        <span className="text-lg font-bold">{title}{count != null && <span className="ml-2 text-sm font-normal text-muted">({count})</span>}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}
