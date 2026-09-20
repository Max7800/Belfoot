"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { generateEligibles } from "@/lib/votw";

const CATS = ["GK", "DEF", "MID", "FWD"];
const STATUS = ["open", "closed", "published"];
const box = "rounded border border-line/10 bg-surface2 px-2 py-1.5 text-sm text-content";
const dt = (v) => (v ? String(v).slice(0, 16) : "");

export default function VotwSessionsPanel() {
  const [sessions, setSessions] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [draft, setDraft] = useState({ competition_id: "", season_id: "", matchday: "", formation: "4-3-3", season_label: "", opens_at: "", closes_at: "", status: "open" });
  const [expanded, setExpanded] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [voteCount, setVoteCount] = useState(0);
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSessions = () => supabase.from("votw_sessions").select("*").order("created_at", { ascending: false }).then(({ data }) => setSessions(data || []));
  useEffect(() => {
    loadSessions();
    supabase.from("competitions").select("id,name").order("name").then(({ data }) => setCompetitions(data || []));
    supabase.from("seasons").select("id,label,competition_id").order("label", { ascending: false }).then(({ data }) => setSeasons(data || []));
  }, []);

  const compName = (id) => competitions.find((c) => c.id === id)?.name || "—";
  const seasonLabel = (id) => seasons.find((s) => s.id === id)?.label || "";

  const create = async () => {
    if (!draft.competition_id || !draft.season_id || draft.matchday === "") { setMsg("Compétition, saison et journée sont requises."); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.from("votw_sessions").insert({
      kind: "week", competition_id: draft.competition_id, season_id: draft.season_id,
      matchday: Number(draft.matchday), formation: draft.formation || "4-3-3",
      season_label: draft.season_label || null, status: draft.status || "open",
      opens_at: draft.opens_at || null, closes_at: draft.closes_at || null,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else { setDraft({ competition_id: "", season_id: "", matchday: "", formation: "4-3-3", season_label: "", opens_at: "", closes_at: "", status: "open" }); loadSessions(); }
  };

  const patch = async (id, obj) => { await supabase.from("votw_sessions").update(obj).eq("id", id); loadSessions(); };

  const loadCandidates = async (sessionId) => {
    const { data: cand } = await supabase.from("votw_candidates").select("id,player_id,position").eq("session_id", sessionId);
    const ids = (cand || []).map((c) => c.player_id);
    const { data: players } = ids.length ? await supabase.from("players").select("id,name").in("id", ids) : { data: [] };
    const byId = Object.fromEntries((players || []).map((p) => [p.id, p]));
    setCandidates((cand || []).map((c) => ({ ...c, player: byId[c.player_id] })).sort((a, b) => CATS.indexOf(a.position) - CATS.indexOf(b.position) || (a.player?.name || "").localeCompare(b.player?.name || "")));
    const { count } = await supabase.from("votw_votes").select("member_id", { count: "exact", head: true }).eq("session_id", sessionId);
    setVoteCount(count || 0);
  };

  const toggle = async (session) => {
    if (expanded === session.id) { setExpanded(null); return; }
    setExpanded(session.id); setCandidates([]); setVoteCount(0); setQ(""); setFound([]); setMsg("");
    await loadCandidates(session.id);
  };

  const generate = async (session) => {
    setBusy(true); setMsg("");
    try { const r = await generateEligibles(session); const src = r.source === "squad" ? " — repli effectifs (pas de stats de match)" : r.source === "none" ? " — aucun match pour cette journée" : ""; setMsg(`${r.added} ajouté(s) · ${r.found} trouvé(s) sur ${r.matches} match(s)${src}.`); await loadCandidates(session.id); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const search = async () => {
    if (q.trim().length < 2) { setFound([]); return; }
    const { data } = await supabase.from("players").select("id,name").ilike("name", `%${q.trim()}%`).limit(8);
    setFound(data || []);
  };
  const addCand = async (player, sessionId) => { await supabase.from("votw_candidates").insert({ session_id: sessionId, player_id: player.id, position: "MID" }); setQ(""); setFound([]); await loadCandidates(sessionId); };
  const removeCand = async (c, sessionId) => { await supabase.from("votw_candidates").delete().eq("id", c.id); await loadCandidates(sessionId); };
  const setCat = async (c, position, sessionId) => { await supabase.from("votw_candidates").update({ position }).eq("id", c.id); await loadCandidates(sessionId); };

  return (
    <div>
      <h2 className="mb-2 text-lg font-bold">Onze de la semaine</h2>
      <p className="mb-4 text-xs text-muted">Crée une session de vote pour une journée, génère les joueurs éligibles depuis les stats de match (aucun appel API), ajuste-les, puis ouvre le vote. La composition du terrain + la publication du résultat arrivent dans les prochaines briques.</p>
      {msg && <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-sm text-amber-200">{msg}</p>}

      <div className="mb-6 rounded-xl border border-line/10 bg-surface p-3">
        <div className="mb-2 text-xs font-semibold text-muted">Nouvelle session</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted">Compétition<select value={draft.competition_id} onChange={(e) => setDraft({ ...draft, competition_id: e.target.value })} className={`mt-1 w-full ${box}`}><option value="">—</option>{competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-xs text-muted">Saison<select value={draft.season_id} onChange={(e) => setDraft({ ...draft, season_id: e.target.value })} className={`mt-1 w-full ${box}`}><option value="">—</option>{seasons.filter((s) => !draft.competition_id || s.competition_id === draft.competition_id).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label className="text-xs text-muted">Journée<input type="number" value={draft.matchday} onChange={(e) => setDraft({ ...draft, matchday: e.target.value })} className={`mt-1 w-full ${box}`} /></label>
          <label className="text-xs text-muted">Formation<input value={draft.formation} onChange={(e) => setDraft({ ...draft, formation: e.target.value })} className={`mt-1 w-full ${box}`} /></label>
          <label className="text-xs text-muted">Étiquette saison (archive)<input value={draft.season_label} onChange={(e) => setDraft({ ...draft, season_label: e.target.value })} placeholder="2024-2025" className={`mt-1 w-full ${box}`} /></label>
          <label className="text-xs text-muted">Statut<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={`mt-1 w-full ${box}`}>{STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="text-xs text-muted">Ouverture<input type="datetime-local" value={draft.opens_at} onChange={(e) => setDraft({ ...draft, opens_at: e.target.value })} className={`mt-1 w-full ${box}`} /></label>
          <label className="text-xs text-muted">Fermeture<input type="datetime-local" value={draft.closes_at} onChange={(e) => setDraft({ ...draft, closes_at: e.target.value })} className={`mt-1 w-full ${box}`} /></label>
        </div>
        <button onClick={create} disabled={busy} className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Créer la session</button>
      </div>

      <div className="space-y-2">
        {sessions.map((s) => (
          <div key={s.id} className="rounded-xl border border-line/10 bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button onClick={() => toggle(s)} className="font-bold hover:text-accent">Journée {s.matchday ?? "—"} · {compName(s.competition_id)}</button>
              <span className="text-xs text-muted">{seasonLabel(s.season_id)} · {s.formation || "4-3-3"}</span>
              <select value={s.status} onChange={(e) => patch(s.id, { status: e.target.value, published_at: e.target.value === "published" ? new Date().toISOString() : null })} className={`ml-auto ${box}`}>{STATUS.map((st) => <option key={st} value={st}>{st}</option>)}</select>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <label className="text-[11px] text-muted">Journée<input type="number" defaultValue={s.matchday ?? ""} onBlur={(e) => patch(s.id, { matchday: e.target.value === "" ? null : Number(e.target.value) })} className={`mt-1 w-full ${box}`} /></label>
              <label className="text-[11px] text-muted">Ouverture<input type="datetime-local" defaultValue={dt(s.opens_at)} onBlur={(e) => patch(s.id, { opens_at: e.target.value || null })} className={`mt-1 w-full ${box}`} /></label>
              <label className="text-[11px] text-muted">Fermeture<input type="datetime-local" defaultValue={dt(s.closes_at)} onBlur={(e) => patch(s.id, { closes_at: e.target.value || null })} className={`mt-1 w-full ${box}`} /></label>
            </div>

            {expanded === s.id && (
              <div className="mt-3 border-t border-line/10 pt-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => generate(s)} disabled={busy} className="rounded-lg border border-line/20 px-3 py-1.5 text-sm font-bold hover:border-accent/40 disabled:opacity-50">Générer les éligibles</button>
                  <span className="text-xs text-muted">{candidates.length} éligible(s) · {voteCount} vote(s)</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Ajouter un joueur (nom)…" className={`${box} min-w-0 flex-1`} />
                  <button onClick={search} className="rounded-lg border border-line/20 px-3 py-1.5 text-sm hover:border-accent/40">Chercher</button>
                </div>
                {found.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{found.map((p) => <button key={p.id} onClick={() => addCand(p, s.id)} className="rounded-full border border-line/20 px-3 py-1 text-xs hover:border-accent/40">+ {p.name}</button>)}</div>}

                <div className="mt-3 divide-y divide-line/10 rounded-lg border border-line/10">
                  {candidates.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 p-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{c.player?.name || "(joueur inconnu)"}</span>
                      <select value={c.position} onChange={(e) => setCat(c, e.target.value, s.id)} className={box}>{CATS.map((cat) => <option key={cat} value={cat}>{cat}</option>)}</select>
                      <button onClick={() => removeCand(c, s.id)} className="px-2 text-muted hover:text-red-300">Retirer</button>
                    </div>
                  ))}
                  {candidates.length === 0 && <p className="p-3 text-xs text-muted">Aucun éligible. Clique « Générer les éligibles » (ou ajoute à la main).</p>}
                </div>
              </div>
            )}
          </div>
        ))}
        {sessions.length === 0 && <p className="text-sm text-muted">Aucune session. Crée la première ci-dessus.</p>}
      </div>
    </div>
  );
}
