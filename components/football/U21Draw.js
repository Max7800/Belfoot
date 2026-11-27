"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { UEFA_U21_DRAW_KEY, UEFA_U21_DRAW_SOURCE, UEFA_U21_NAMES, UEFA_U21_START, validU21Draw } from "@/lib/uefaDraw";
export default function U21Draw({ team }) {
  const [snapshot, setSnapshot] = useState(null);
  const isU21 = team?.source === "apifootball" && String(team?.external_id) === "8183";
  useEffect(() => {
    let active = true;
    setSnapshot(null);
    if (isU21) supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data, error }) => {
      const draw = data?.data?.[UEFA_U21_DRAW_KEY];
      if (active && !error && validU21Draw(draw?.groups)) setSnapshot(draw);
    }).catch(() => { if (active) setSnapshot(null); });
    return () => { active = false; };
  }, [isU21]);
  if (!isU21 || !snapshot || Date.now() >= UEFA_U21_START) return null;
  const group = snapshot.groups.find((item) => item.teams.includes("Belgium"));
  if (!group) return null;
  return <section className="rounded-2xl border border-amber-400/20 bg-surface/60 p-4"><h2 className="text-xs font-black uppercase tracking-wider text-amber-300">Euro U21 2027 · Groupe {group.label.slice(-1)}</h2><p className="mt-2 text-xs text-muted">Tirage officiel · <a href={UEFA_U21_DRAW_SOURCE} target="_blank" rel="noreferrer" className="underline">Source UEFA</a></p><div className="mt-3 flex flex-wrap gap-2">{group.teams.map((name) => <span key={name} className={`rounded-lg border px-3 py-1.5 text-sm ${name === "Belgium" ? "border-red-400/40 bg-red-500/15 font-bold text-amber-100" : "border-line/10"}`}>{UEFA_U21_NAMES[name]}</span>)}</div></section>;
}
