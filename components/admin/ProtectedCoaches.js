"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Une protection peut être manuelle ou provider : dans les deux cas le job
// ignore le club. Ne pas interpréter synced_at comme une date de vérification.
export default function ProtectedCoaches() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from("coaches").select("id,name,club_id,source,clubs(name)").eq("locked", true).not("club_id", "is", null).order("id").range(offset, offset + 499);
        if (!active) return;
        if (result.error) { setError(result.error.message || "Chargement impossible"); return; }
        all.push(...(result.data || []));
        if ((result.data || []).length < 500) break;
      }
      setRows(all.sort((a, b) => (a.clubs?.name || "").localeCompare(b.clubs?.name || "", "fr")));
    }
    load();
    return () => { active = false; };
  }, []);
  return <section className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
    <h3 className="text-sm font-bold text-amber-200">Entraîneurs protégés {rows && `(${rows.length})`}</h3>
    <p className="mt-1 text-xs leading-5 text-muted">La synchronisation automatique ignore ces clubs. Vérifie régulièrement ces noms et modifie les fiches en cas de changement. Une protection ne garantit pas que le nom est actuel.</p>
    {error ? <p role="alert" className="mt-2 text-xs text-red-300">Liste indisponible : {error}</p> : rows === null ? <p className="mt-2 text-xs text-muted">Chargement…</p> : rows.length === 0 ? <p className="mt-2 text-xs text-muted">Aucun entraîneur protégé associé à un club.</p> : <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">{rows.map((coach) => <li key={coach.id}><a className="font-bold text-content underline" href={`/clubs/${coach.club_id}`}>{coach.clubs?.name || "Club inconnu"}</a> · {coach.name} <span className="text-muted">({coach.source === "manual" ? "manuel" : coach.source || "source inconnue"})</span></li>)}</ul>}
  </section>;
}
