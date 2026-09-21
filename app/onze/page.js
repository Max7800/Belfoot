"use client";
import { useEffect, useMemo, useState } from "react";
import { Star, X, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { formationSlots } from "@/lib/votw";

// ── Style du terrain, regroupé ici ─────────────────────────────────────────
// Le design collera au site plus tard : pour le re-styler, tout est ici (fond,
// lignes, cartes joueur), sans toucher à la logique. Utilise les tokens du site
// (surface/muted/accent…) là où c'est pertinent ; le vert du terrain reste local.
const PITCH = {
  field: "relative mx-auto aspect-[2/3] w-full max-w-md overflow-hidden rounded-3xl border border-line/15 bg-gradient-to-b from-emerald-800/50 to-emerald-950/70",
  line: "bg-white/15",
  lineBorder: "border-white/15",
  avatar: "h-11 w-11 overflow-hidden rounded-full border-2 border-white/70 bg-surface2 sm:h-14 sm:w-14",
  nameTag: "mt-1 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5",
  nameText: "max-w-[52px] truncate text-[10px] font-bold text-white sm:max-w-[68px]",
  empty: "flex h-11 w-11 flex-col items-center justify-center rounded-full border-2 border-dashed border-white/50 bg-black/25 text-white/80 sm:h-14 sm:w-14",
};

// « 11 de la semaine » — terrain 4-3-3 + vote communautaire.
// Sous-lot 2 : composition + vote (1 XI par membre, modifiable tant que le vote
// est ouvert, un joueur une seule fois). Le calcul/affichage du résultat final
// (Onze des lecteurs + Onze Belfoot) arrive au sous-lot 3.
export default function OnzePage() {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [loading, setLoading] = useState(true);
  const [sess, setSess] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [info, setInfo] = useState({});
  const [picks, setPicks] = useState({});
  const [results, setResults] = useState({});
  const [openSlot, setOpenSlot] = useState(null);
  const [q, setQ] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const slots = formationSlots(sess?.formation || "4-3-3");
  const votable = !!sess && sess.status === "open" && (!sess.closes_at || new Date(sess.closes_at) > new Date());
  const filled = Object.keys(picks).length;

  async function loadData(s) {
    const { data: cand } = await supabase.from("votw_candidates").select("player_id,position").eq("session_id", s.id);
    setCandidates(cand || []);
    const ids = [...new Set((cand || []).map((c) => c.player_id))];
    const { data: players } = ids.length ? await supabase.from("players").select("id,name,photo_url,position,club_id").in("id", ids) : { data: [] };
    const clubIds = [...new Set((players || []).map((p) => p.club_id).filter(Boolean))];
    const { data: clubs } = clubIds.length ? await supabase.from("clubs").select("id,name,logo_url").in("id", clubIds) : { data: [] };
    const clubById = Object.fromEntries((clubs || []).map((c) => [c.id, c]));

    const stats = {};
    if (s.competition_id && s.season_id && s.matchday != null && ids.length) {
      const { data: matches } = await supabase.from("matches").select("id").eq("competition_id", s.competition_id).eq("season_id", s.season_id).eq("matchday", s.matchday);
      const matchIds = (matches || []).map((m) => m.id);
      if (matchIds.length) {
        const { data: rows } = await supabase.from("match_player_stats").select("player_id,minutes,goals,assists,yellow,red,rating").in("match_id", matchIds).in("player_id", ids);
        for (const r of rows || []) {
          const cur = stats[r.player_id] || { minutes: 0, goals: 0, assists: 0, cards: 0, rating: null };
          cur.minutes += r.minutes || 0; cur.goals += r.goals || 0; cur.assists += r.assists || 0;
          cur.cards += (r.yellow || 0) + (r.red || 0);
          if (r.rating != null) cur.rating = Math.max(cur.rating ?? 0, Number(r.rating));
          stats[r.player_id] = cur;
        }
      }
    }

    const map = {};
    for (const p of players || []) {
      const club = clubById[p.club_id];
      map[p.id] = { name: p.name, photo: p.photo_url, position: p.position, clubId: p.club_id, club: club?.name, clubLogo: club?.logo_url, ...(stats[p.id] || { minutes: 0, goals: 0, assists: 0, cards: 0, rating: null }) };
    }
    setInfo(map);

    if (userId) {
      const { data: votes } = await supabase.from("votw_votes").select("position,player_id").eq("session_id", s.id).eq("member_id", userId);
      setPicks(Object.fromEntries((votes || []).map((v) => [v.position, v.player_id])));
    } else {
      setPicks({});
    }

    if (s.status !== "open") {
      const { data: res } = await supabase.from("votw_results").select("position,votes,player_snapshot").eq("session_id", s.id);
      setResults(Object.fromEntries((res || []).map((r) => [r.position, { ...(r.player_snapshot || {}), votes: r.votes }])));
    } else {
      setResults({});
    }
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("votw_sessions").select("*").order("created_at", { ascending: false }).limit(10);
      if (error) { setLoading(false); return; }
      const s = (data || []).find((x) => x.status === "open") || (data || [])[0] || null;
      setSess(s);
      if (s) await loadData(s);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const pickedElsewhere = useMemo(
    () => new Set(Object.entries(picks).filter(([slotId]) => slotId !== openSlot?.id).map(([, pid]) => pid)),
    [picks, openSlot]
  );

  // Clubs présents parmi les joueurs éligibles de ce poste (pour le filtre club).
  const slotClubs = useMemo(() => {
    if (!openSlot) return [];
    const seen = new Map();
    for (const c of candidates) {
      if (c.position !== openSlot.cat) continue;
      const i = info[c.player_id];
      if (i?.clubId && !seen.has(i.clubId)) seen.set(i.clubId, i.club || "Club");
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [openSlot, candidates, info]);

  const options = useMemo(() => {
    if (!openSlot) return [];
    const term = q.trim().toLowerCase();
    return candidates
      .filter((c) => c.position === openSlot.cat && !pickedElsewhere.has(c.player_id))
      .filter((c) => !clubFilter || info[c.player_id]?.clubId === clubFilter)
      .filter((c) => !term || (info[c.player_id]?.name || "").toLowerCase().includes(term))
      .sort((a, b) => (info[b.player_id]?.rating ?? 0) - (info[a.player_id]?.rating ?? 0) || (info[b.player_id]?.minutes ?? 0) - (info[a.player_id]?.minutes ?? 0));
  }, [openSlot, candidates, pickedElsewhere, q, clubFilter, info]);

  async function pick(slot, playerId) {
    if (!votable || !userId) return;
    setSaving(true);
    const { error } = await supabase.from("votw_votes").upsert({ session_id: sess.id, member_id: userId, position: slot.id, player_id: playerId }, { onConflict: "session_id,member_id,position" });
    if (!error) setPicks((p) => ({ ...p, [slot.id]: playerId }));
    setSaving(false);
    setOpenSlot(null); setQ("");
  }
  async function clearSlot(slot) {
    if (!votable || !userId) return;
    await supabase.from("votw_votes").delete().eq("session_id", sess.id).eq("member_id", userId).eq("position", slot.id);
    setPicks((p) => { const n = { ...p }; delete n[slot.id]; return n; });
    setOpenSlot(null);
  }

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-center text-muted">Chargement…</div>;

  if (!sess) return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3"><Star className="h-7 w-7 text-amber-300" /><h1 className="text-3xl font-black">Le 11 de la semaine</h1></div>
      <p className="rounded-2xl border border-dashed border-line/15 p-6 text-center text-sm text-muted">Aucun vote ouvert pour l'instant. Reviens bientôt !</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Star className="h-7 w-7 text-amber-300" />
        <h1 className="text-2xl font-black sm:text-3xl">Le 11 de la semaine</h1>
        <span className="text-sm text-muted">Journée {sess.matchday}{sess.season_label ? ` · ${sess.season_label}` : ""} · {sess.formation || "4-3-3"}</span>
        {votable && <span className="ml-auto rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-300">{filled}/11</span>}
        {!votable && Object.keys(results).length > 0 && <span className="ml-auto rounded-full bg-amber-400/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-300">Onze des lecteurs</span>}
      </div>

      {!userId && <p className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-sm text-amber-200">Connecte-toi pour composer et enregistrer ton XI.</p>}
      {!votable && Object.keys(results).length === 0 && <p className="rounded-xl border border-line/15 bg-surface p-3 text-sm text-muted"><Trophy className="mr-2 inline h-4 w-4" />Le vote est fermé. Le résultat sera publié ici.</p>}
      {!votable && Object.keys(results).length > 0 && <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200"><Trophy className="mr-2 inline h-4 w-4" />Voici le 11 élu par les lecteurs pour cette journée.</p>}

      {/* Terrain — style regroupé dans la constante PITCH (haut du fichier) */}
      <div className={PITCH.field}>
        <div className="pointer-events-none absolute inset-0">
          <div className={`absolute left-0 right-0 top-1/2 h-px ${PITCH.line}`} />
          <div className={`absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border ${PITCH.lineBorder}`} />
          <div className={`absolute left-1/2 top-0 h-14 w-28 -translate-x-1/2 border border-t-0 ${PITCH.lineBorder}`} />
          <div className={`absolute left-1/2 bottom-0 h-14 w-28 -translate-x-1/2 border border-b-0 ${PITCH.lineBorder}`} />
        </div>
        {slots.map((slot) => {
          const pid = picks[slot.id];
          const p = votable ? (pid ? info[pid] : null) : (results[slot.id] || null);
          return (
            <button key={slot.id} onClick={() => { if (votable && userId) { setQ(""); setClubFilter(""); setOpenSlot(slot); } }} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} className="absolute -translate-x-1/2 -translate-y-1/2">
              {p ? (
                <div className="flex w-16 flex-col items-center sm:w-20">
                  <div className={PITCH.avatar}>{p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover object-top" /> : <span className="flex h-full w-full items-center justify-center text-[10px] text-muted">{slot.id}</span>}</div>
                  <div className={PITCH.nameTag}><span className={PITCH.nameText}>{p.name}</span>{p.clubLogo && <img src={p.clubLogo} alt="" className="h-3 w-3 object-contain" />}</div>
                  {!votable && p.votes != null && <div className="mt-0.5 rounded-full bg-amber-400/20 px-1.5 text-[9px] font-black text-amber-300">{p.votes} vote{p.votes > 1 ? "s" : ""}</div>}
                </div>
              ) : (
                <div className={PITCH.empty}><span className="text-lg leading-none">+</span><span className="text-[8px] uppercase">{slot.label.split(" ")[0]}</span></div>
              )}
            </button>
          );
        })}
      </div>

      {votable && userId && filled === 11 && <p className="text-center text-sm font-bold text-emerald-300">Ton XI est complet et enregistré. Tu peux encore le modifier tant que le vote est ouvert.</p>}

      {/* Panneau / drawer de choix */}
      {openSlot && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setOpenSlot(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-t-3xl border border-line/15 bg-bg sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line/10 p-4">
              <div><div className="text-xs font-black uppercase tracking-wider text-amber-300">{openSlot.label}</div><div className="text-sm text-muted">{options.length} joueur(s)</div></div>
              <button onClick={() => setOpenSlot(null)} className="rounded-full p-1 text-muted hover:text-content"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-3">
              {slotClubs.length > 1 && (
                <select value={clubFilter} onChange={(e) => setClubFilter(e.target.value)} className="mb-2 w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm">
                  <option value="">Tous les clubs ({slotClubs.length})</option>
                  {slotClubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un joueur…" className="mb-3 w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm" />
              <div className="max-h-[52vh] space-y-1 overflow-y-auto">
                {options.map((c) => { const p = info[c.player_id] || {}; return (
                  <button key={c.player_id} onClick={() => pick(openSlot, c.player_id)} disabled={saving} className="flex w-full items-center gap-3 rounded-xl border border-line/10 bg-surface p-2 text-left transition hover:border-amber-400/40 disabled:opacity-50">
                    <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border border-white/10 bg-surface2">{p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover object-top" /> : null}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5"><span className="truncate text-sm font-bold">{p.name}</span>{p.clubLogo && <img src={p.clubLogo} alt="" className="h-3.5 w-3.5 object-contain" />}</div>
                      <div className="truncate text-[11px] text-muted">{p.club || ""}{p.position ? ` · ${p.position}` : ""}</div>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-400"><span>{p.minutes || 0}′</span><span>{p.goals || 0} but(s)</span><span>{p.assists || 0} pd</span>{p.cards ? <span>{p.cards} 🟨</span> : null}{p.rating != null ? <span className="font-bold text-amber-300">{Number(p.rating).toFixed(1)}</span> : null}</div>
                    </div>
                  </button>
                ); })}
                {options.length === 0 && <p className="p-4 text-center text-sm text-muted">Aucun joueur éligible pour ce poste.</p>}
              </div>
              {picks[openSlot.id] && <button onClick={() => clearSlot(openSlot)} className="mt-3 w-full rounded-lg border border-red-400/30 py-2 text-sm font-bold text-red-300">Retirer le joueur de ce poste</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
