"use client";
import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";

// Notes des Diables + Diable du match, pour un match Belgique A terminé.
// Fenêtre : ouverte à la fin du match, ~4 jours (imposée aussi côté base).
export default function DiableRatings({ match, squad, title = "Notez les Diables", compact = false, showAllLabel = "Voir tous les joueurs", showLessLabel = "Réduire" }) {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [myRatings, setMyRatings] = useState({});
  const [myMotm, setMyMotm] = useState(null);
  const [avgs, setAvgs] = useState({});
  const [motmAgg, setMotmAgg] = useState({});
  const [expanded, setExpanded] = useState(false);

  const open = match.status === "finished" && match.kickoff && new Date(match.kickoff).getTime() + 4 * 86400000 > Date.now();

  const loadAgg = async () => {
    const [{ data: r }, { data: m }] = await Promise.all([
      supabase.from("player_match_ratings").select("player_id,avg_rating,votes").eq("match_id", match.id),
      supabase.from("match_motm").select("player_id,votes").eq("match_id", match.id),
    ]);
    setAvgs(Object.fromEntries((r || []).map((x) => [x.player_id, x])));
    setMotmAgg(Object.fromEntries((m || []).map((x) => [x.player_id, x.votes])));
  };
  useEffect(() => {
    loadAgg();
    if (userId) {
      supabase.from("player_ratings").select("player_id,rating").eq("match_id", match.id).eq("member_id", userId).then(({ data }) => setMyRatings(Object.fromEntries((data || []).map((x) => [x.player_id, x.rating]))));
      supabase.from("motm_votes").select("player_id").eq("match_id", match.id).eq("member_id", userId).maybeSingle().then(({ data }) => setMyMotm(data?.player_id || null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, userId]);

  const rate = async (playerId, rating) => {
    if (!userId || !open) return;
    setMyRatings((p) => ({ ...p, [playerId]: rating }));
    await supabase.from("player_ratings").upsert({ match_id: match.id, member_id: userId, player_id: playerId, rating }, { onConflict: "match_id,member_id,player_id" });
    loadAgg();
  };
  const pickMotm = async (playerId) => {
    if (!userId || !open) return;
    const next = myMotm === playerId ? null : playerId;
    setMyMotm(next);
    if (next) await supabase.from("motm_votes").upsert({ match_id: match.id, member_id: userId, player_id: playerId }, { onConflict: "match_id,member_id" });
    else await supabase.from("motm_votes").delete().eq("match_id", match.id).eq("member_id", userId);
    loadAgg();
  };

  const motmLeader = useMemo(() => {
    let best = null;
    for (const [pid, votes] of Object.entries(motmAgg)) if (!best || votes > best.votes) best = { pid, votes };
    return best;
  }, [motmAgg]);
  const leaderPlayer = motmLeader && squad.find((s) => s.player.id === motmLeader.pid)?.player;
  const shownSquad = compact && !expanded ? squad.slice(0, 10) : squad;

  return (
    <div className="rounded-2xl border border-line/10 bg-surface/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-wider text-red-300">{title}</div>
        {open ? <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">Ouvert</span> : <span className="rounded-full bg-surface2 px-2.5 py-0.5 text-[11px] text-muted">Notation fermée</span>}
      </div>

      {leaderPlayer && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3">
          {leaderPlayer.photo_url ? <img src={leaderPlayer.photo_url} className="h-10 w-10 rounded-full object-cover" alt="" /> : <Star className="h-8 w-8 text-amber-300" />}
          <div><div className="text-[11px] font-black uppercase tracking-wider text-amber-300">Diable du match des lecteurs</div><div className="text-sm font-bold">{leaderPlayer.name} <span className="text-xs text-muted">· {motmLeader.votes} vote{motmLeader.votes > 1 ? "s" : ""}</span></div></div>
        </div>
      )}

      {!userId && open && <p className="mb-3 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2 text-sm text-amber-200">Connecte-toi pour noter les Diables et élire ton Diable du match.</p>}

      <div className="divide-y divide-line/10">
        {shownSquad.map((row) => {
          const p = row.player;
          const agg = avgs[p.id];
          return (
            <div key={p.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              {agg && <span className="flex-shrink-0 text-xs text-muted" title={`${agg.votes} note(s)`}>moy. <b className="text-amber-300">{agg.avg_rating}</b></span>}
              <button onClick={() => pickMotm(p.id)} disabled={!open || !userId} title="Diable du match" className={`flex-shrink-0 rounded p-1 disabled:opacity-40 ${myMotm === p.id ? "text-amber-300" : "text-muted hover:text-amber-300"}`}><Star className="h-4 w-4" fill={myMotm === p.id ? "currentColor" : "none"} /></button>
              <select value={myRatings[p.id] ?? ""} onChange={(e) => rate(p.id, Number(e.target.value))} disabled={!open || !userId} className="flex-shrink-0 rounded border border-line/10 bg-surface2 px-2 py-1 text-sm disabled:opacity-40">
                <option value="">–</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          );
        })}
        {squad.length === 0 && <p className="py-3 text-sm text-muted">L'effectif de cette sélection apparaîtra ici après synchronisation.</p>}
      </div>
      {compact && squad.length > 10 && <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-3 w-full rounded-xl border border-line/10 px-3 py-2 text-xs font-bold text-muted transition hover:border-red-400/30 hover:text-white">{expanded ? showLessLabel : `${showAllLabel} (${squad.length})`}</button>}
    </div>
  );
}
