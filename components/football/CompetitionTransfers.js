"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { seasonYear } from "@/modules/football/season";

// Transferts d'un championnat : arrivées/départs des clubs de la compétition.
// Les transferts sont liés aux clubs (pas de competition_id), donc on part des
// clubs du championnat pour la saison, puis on récupère leurs mouvements.
// Composant autonome : se glisse tel quel dans un onglet de la page compétition.
export default function CompetitionTransfers({ competition }) {
  const [year, setYear] = useState(() => seasonYear(competition?.ext?.season) || new Date().getFullYear());
  const [years, setYears] = useState([]);
  const [rows, setRows] = useState([]);
  const [clubIds, setClubIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!competition?.id) return;
    supabase.from("seasons").select("label").eq("competition_id", competition.id).then(({ data }) => {
      const ys = [...new Set((data || []).map((s) => seasonYear(s.label)).filter(Boolean))].sort((a, b) => b - a);
      if (ys.length) { setYears(ys); setYear((prev) => (ys.includes(prev) ? prev : ys[0])); }
    });
  }, [competition?.id]);

  useEffect(() => {
    if (!competition?.id || !year) return;
    setLoading(true);
    (async () => {
      const { data: seasonRows } = await supabase.from("seasons").select("id,label").eq("competition_id", competition.id);
      const seasonRow = (seasonRows || []).find((s) => seasonYear(s.label) === year);
      let mq = supabase.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
      if (seasonRow?.id) mq = mq.eq("season_id", seasonRow.id);
      const { data: matches } = await mq;
      const ids = new Set((matches || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean));
      setClubIds(ids);
      if (!ids.size) { setRows([]); setLoading(false); return; }
      const idList = [...ids].join(",");
      const { data } = await supabase.from("player_transfers")
        .select("id,player_id,player_name,from_club_id,to_club_id,from_club_name,to_club_name,transfer_date,transfer_type")
        .eq("season_start_year", year)
        .or(`from_club_id.in.(${idList}),to_club_id.in.(${idList})`)
        .order("transfer_date", { ascending: false });
      setRows(data || []);
      setLoading(false);
    })().catch(() => { setRows([]); setLoading(false); });
  }, [competition?.id, year]);

  const view = useMemo(() => rows.map((t) => {
    const arriving = t.to_club_id && clubIds.has(t.to_club_id);
    const leaving = t.from_club_id && clubIds.has(t.from_club_id);
    const dir = arriving && !leaving ? "in" : leaving && !arriving ? "out" : arriving && leaving ? "internal" : "other";
    return { ...t, dir };
  }).filter((t) => filter === "all" || t.dir === filter || (filter === "in" && t.dir === "internal")), [rows, clubIds, filter]);

  const isLoan = (type) => /loan|prêt|pret/i.test(type || "");
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };

  const TABS = [["all", "Tous"], ["in", "Arrivées"], ["out", "Départs"]];

  return (
    <div className="rounded-2xl border border-line/10 bg-surface/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-surface2 p-1 text-xs">
          {TABS.map(([k, label]) => <button key={k} onClick={() => setFilter(k)} className={`rounded px-3 py-1 font-bold ${filter === k ? "bg-accent text-white" : "text-muted hover:text-content"}`}>{label}</button>)}
        </div>
        {years.length > 1 && (
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="ml-auto rounded-lg border border-line/10 bg-surface2 px-2 py-1 text-sm">
            {years.map((y) => <option key={y} value={y}>{y}–{y + 1}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted">Chargement des transferts…</p>
      ) : view.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Aucun transfert enregistré pour cette saison.</p>
      ) : (
        <div className="divide-y divide-line/10">
          {view.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${t.dir === "in" ? "bg-emerald-500/15 text-emerald-300" : t.dir === "out" ? "bg-red-500/15 text-red-300" : "bg-surface2 text-muted"}`}>
                {t.dir === "in" ? "ARRIVÉE" : t.dir === "out" ? "DÉPART" : "INTERNE"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{t.player_id ? <Link href={`/players/${t.player_id}`} className="hover:text-accent">{t.player_name}</Link> : t.player_name}</div>
                <div className="flex items-center gap-1.5 truncate text-xs text-muted">
                  <span className="truncate">{t.from_club_name || "?"}</span>
                  <ArrowRight className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{t.to_club_name || "?"}</span>
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                {t.transfer_type && <div className={`text-[10px] font-bold ${isLoan(t.transfer_type) ? "text-amber-300" : "text-muted"}`}>{isLoan(t.transfer_type) ? "Prêt" : "Définitif"}</div>}
                <div className="text-[11px] text-muted">{fmtDate(t.transfer_date)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
