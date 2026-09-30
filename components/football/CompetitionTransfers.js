"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { seasonYear } from "@/modules/football/season";

// API-Football range le montant dans "type" : "€ 20.5M", "€ 500K", "Loan", "Free", "N/A"…
function parseFee(type) {
  if (!type || !/[€$£]/.test(type)) return null;
  const m = String(type).replace(/\s/g, "").match(/([\d.,]+)\s*([MK])?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, "."));
  if (Number.isNaN(n)) return null;
  if (/M/i.test(m[2] || "")) n *= 1e6;
  else if (/K/i.test(m[2] || "")) n *= 1e3;
  return n;
}
const isLoan = (t) => /loan|prêt|pret/i.test(t || "");
const isFree = (t) => /free|libre/i.test(t || "");

export default function CompetitionTransfers({ competition }) {
  const [year, setYear] = useState(() => Number(seasonYear(competition?.ext?.season)) || new Date().getFullYear());
  const [years, setYears] = useState([]);
  const [rows, setRows] = useState([]);
  const [clubIds, setClubIds] = useState(() => new Set());
  const [clubs, setClubs] = useState([]);
  const [photos, setPhotos] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [clubFilter, setClubFilter] = useState("");

  useEffect(() => {
    if (!competition?.id) return;
    supabase.from("seasons").select("label").eq("competition_id", competition.id).then(({ data }) => {
      const ys = [...new Set((data || []).map((s) => Number(seasonYear(s.label))).filter(Boolean))].sort((a, b) => b - a);
      if (ys.length) { setYears(ys); setYear((prev) => (ys.includes(prev) ? prev : ys[0])); }
    });
  }, [competition?.id]);

  useEffect(() => {
    if (!competition?.id || !year) return;
    setLoading(true); setClubFilter("");
    (async () => {
      const { data: seasonRows } = await supabase.from("seasons").select("id,label").eq("competition_id", competition.id);
      const seasonRow = (seasonRows || []).find((s) => Number(seasonYear(s.label)) === year);
      let mq = supabase.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
      if (seasonRow?.id) mq = mq.eq("season_id", seasonRow.id);
      const { data: matches } = await mq;
      const ids = new Set((matches || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean));
      setClubIds(ids);
      if (!ids.size) { setRows([]); setClubs([]); setPhotos({}); setLoading(false); return; }
      const idList = [...ids].join(",");
      const { data } = await supabase.from("player_transfers")
        .select("id,player_id,player_name,from_club_id,to_club_id,from_club_name,to_club_name,transfer_date,transfer_type")
        .eq("season_start_year", year)
        .or(`from_club_id.in.(${idList}),to_club_id.in.(${idList})`)
        .order("transfer_date", { ascending: false });
      const list = data || [];
      setRows(list);
      const { data: clubRows } = await supabase.from("clubs").select("id,name").in("id", [...ids]).order("name");
      setClubs(clubRows || []);
      const pids = [...new Set(list.map((t) => t.player_id).filter(Boolean))];
      if (pids.length) {
        const { data: pl } = await supabase.from("players").select("id,photo_url").in("id", pids);
        setPhotos(Object.fromEntries((pl || []).map((p) => [p.id, p.photo_url])));
      } else setPhotos({});
      setLoading(false);
    })().catch(() => { setRows([]); setLoading(false); });
  }, [competition?.id, year]);

  const decorated = useMemo(() => rows.map((t) => {
    const arriving = t.to_club_id && clubIds.has(t.to_club_id);
    const leaving = t.from_club_id && clubIds.has(t.from_club_id);
    const dir = arriving && !leaving ? "in" : leaving && !arriving ? "out" : arriving && leaving ? "internal" : "other";
    return { ...t, dir, fee: parseFee(t.transfer_type) };
  }), [rows, clubIds]);

  const view = useMemo(() => decorated.filter((t) => {
    if (filter === "in" && !(t.dir === "in" || t.dir === "internal")) return false;
    if (filter === "out" && !(t.dir === "out" || t.dir === "internal")) return false;
    if (clubFilter && t.from_club_id !== clubFilter && t.to_club_id !== clubFilter) return false;
    return true;
  }), [decorated, filter, clubFilter]);

  const top5 = useMemo(() => decorated.filter((t) => t.fee).sort((a, b) => b.fee - a.fee).slice(0, 5), [decorated]);

  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
  const amountLabel = (t) => isLoan(t.transfer_type) ? "Prêt" : t.fee ? t.transfer_type.trim() : isFree(t.transfer_type) ? "Libre" : "Définitif";
  const amountClass = (t) => isLoan(t.transfer_type) ? "text-amber-300" : t.fee ? "text-emerald-300" : "text-muted";
  const TABS = [["all", "Tous"], ["in", "Arrivées"], ["out", "Départs"]];

  return (
    <div className="space-y-4">
      {top5.length > 0 && (
        <div className="rounded-2xl border border-line/10 bg-surface/60 p-4">
          <div className="mb-3 text-xs font-black uppercase tracking-wider text-emerald-300">💰 Plus gros transferts</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {top5.map((t, i) => (
              <div key={t.id} className="rounded-xl border border-line/10 bg-surface2 p-3 text-center">
                <div className="relative mx-auto h-14 w-14">
                  {photos[t.player_id] ? <img src={photos[t.player_id]} className="h-14 w-14 rounded-full object-cover" alt="" /> : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-lg">👤</div>}
                  <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-white">{i + 1}</span>
                </div>
                <div className="mt-2 truncate text-sm font-bold">{t.player_id ? <Link href={`/players/${t.player_id}`} className="hover:text-accent">{t.player_name}</Link> : t.player_name}</div>
                <div className="truncate text-[10px] text-muted">{t.from_club_name} → {t.to_club_name}</div>
                <div className="mt-1 text-xs font-black text-emerald-300">{t.transfer_type.trim()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-line/10 bg-surface/60 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-surface2 p-1 text-xs">
            {TABS.map(([k, label]) => <button key={k} onClick={() => setFilter(k)} className={`rounded px-3 py-1 font-bold ${filter === k ? "bg-accent text-white" : "text-muted hover:text-content"}`}>{label}</button>)}
          </div>
          {clubs.length > 0 && (
            <select value={clubFilter} onChange={(e) => setClubFilter(e.target.value)} className="rounded-lg border border-line/10 bg-surface2 px-2 py-1 text-sm">
              <option value="">Tous les clubs</option>
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {years.length > 1 && (
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="ml-auto rounded-lg border border-line/10 bg-surface2 px-2 py-1 text-sm">
              {years.map((y) => <option key={y} value={y}>{y}–{Number(y) + 1}</option>)}
            </select>
          )}
        </div>

        {loading ? <p className="py-6 text-center text-sm text-muted">Chargement des transferts…</p>
          : view.length === 0 ? <p className="py-6 text-center text-sm text-muted">Aucun transfert pour ce filtre.</p>
          : (
            <div className="divide-y divide-line/10">
              {view.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${t.dir === "in" ? "bg-emerald-500/15 text-emerald-300" : t.dir === "out" ? "bg-red-500/15 text-red-300" : "bg-surface2 text-muted"}`}>{t.dir === "in" ? "ARRIVÉE" : t.dir === "out" ? "DÉPART" : "INTERNE"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{t.player_id ? <Link href={`/players/${t.player_id}`} className="hover:text-accent">{t.player_name}</Link> : t.player_name}</div>
                    <div className="flex items-center gap-1.5 truncate text-xs text-muted"><span className="truncate">{t.from_club_name || "?"}</span><ArrowRight className="h-3 w-3 flex-shrink-0" /><span className="truncate">{t.to_club_name || "?"}</span></div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className={`text-[11px] font-bold ${amountClass(t)}`}>{amountLabel(t)}</div>
                    <div className="text-[11px] text-muted">{fmtDate(t.transfer_date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
