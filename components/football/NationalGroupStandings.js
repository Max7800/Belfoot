"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { computeStandings } from "@/lib/standings";

// Classement du GROUPE de la sélection, par compétition (Nations League, qualif CDM…).
// IMPORTANT : tout est scopé sur la SAISON EN COURS (l'édition du match le plus récent),
// sinon on mélange les éditions (ex. NL 2024 + NL 2026 = groupe incohérent).
// Le groupe = la sélection + ses adversaires de cette édition ; le classement est calculé
// sur tous les matchs intra-groupe de cette saison. Les amicaux sont ignorés.
export default function NationalGroupStandings({ teamId, matches, competitions }) {
  const [tables, setTables] = useState([]);

  useEffect(() => {
    if (!teamId || !matches?.length) { setTables([]); return; }
    (async () => {
      const byComp = {};
      for (const m of matches) { if (m.competition_id) (byComp[m.competition_id] ||= []).push(m); }
      const out = [];
      const clubIds = new Set();
      for (const [compId, allCompMatches] of Object.entries(byComp)) {
        // Saison en cours = celle du match le plus récent de la sélection dans cette compétition.
        const withSeason = allCompMatches.filter((m) => m.season_id && m.kickoff).sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
        const seasonId = withSeason[0]?.season_id;
        if (!seasonId) continue;
        const compMatches = allCompMatches.filter((m) => m.season_id === seasonId);
        const opponents = new Set();
        for (const m of compMatches) { const opp = m.home_club_id === teamId ? m.away_club_id : m.home_club_id; if (opp) opponents.add(opp); }
        if (!opponents.size) continue;
        const group = [teamId, ...opponents];
        const { data: gm } = await supabase.from("matches")
          .select("home_club_id,away_club_id,home_score,away_score,status")
          .eq("competition_id", compId).eq("season_id", seasonId)
          .in("home_club_id", group).in("away_club_id", group);
        const groupMatches = gm || [];
        // Vrai groupe = des matchs existent entre adversaires (pas uniquement ceux de la sélection).
        const hasOpponentMatches = groupMatches.some((m) => m.home_club_id !== teamId && m.away_club_id !== teamId);
        if (!hasOpponentMatches) continue;
        const standings = computeStandings(groupMatches);
        if (standings.length < 3) continue;
        standings.forEach((r) => clubIds.add(r.club));
        out.push({ compId, standings });
      }
      if (!out.length) { setTables([]); return; }
      const { data: clubs } = await supabase.from("clubs").select("id,name,logo_url").in("id", [...clubIds]);
      const clubMap = Object.fromEntries((clubs || []).map((c) => [c.id, c]));
      setTables(out.map((t) => ({ ...t, clubMap })));
    })().catch(() => setTables([]));
  }, [teamId, matches]);

  if (!tables.length) return null;

  return (
    <div className="space-y-3">
      {tables.map((t) => (
        <div key={t.compId} className="rounded-2xl border border-line/10 bg-surface/60 p-4">
          <div className="mb-2 text-xs font-black uppercase tracking-wider text-amber-300">{competitions?.[t.compId]?.name || "Classement"} — groupe</div>
          <div className="divide-y divide-line/10">
            {t.standings.map((r, i) => {
              const bel = r.club === teamId;
              const c = t.clubMap[r.club] || {};
              return (
                <div key={r.club} className={`flex items-center gap-2 px-1 py-1.5 text-sm ${bel ? "bg-gradient-to-r from-red-500/15 to-transparent shadow-[inset_3px_0_0_rgba(252,211,77,.9)]" : ""}`}>
                  <span className="w-5 flex-shrink-0 text-center text-xs tabular-nums text-muted">{i + 1}</span>
                  {c.logo_url ? <img src={c.logo_url} className="h-5 w-5 flex-shrink-0 object-contain" alt="" /> : <span className="h-5 w-5 flex-shrink-0" />}
                  <span className={`min-w-0 flex-1 truncate ${bel ? "font-black text-amber-100" : "font-semibold"}`}>{c.name || "?"}</span>
                  <span className="flex-shrink-0 text-[11px] text-muted">{r.played} J</span>
                  <span className="hidden flex-shrink-0 text-[11px] text-muted sm:inline">{r.gd > 0 ? "+" : ""}{r.gd}</span>
                  <b className="w-6 flex-shrink-0 text-right tabular-nums">{r.pts}</b>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
