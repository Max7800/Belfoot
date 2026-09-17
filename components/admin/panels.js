"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import siteConfig from "@/config/site";
import { jobKeys } from "@/lib/jobs";
import ImageField from "@/components/ui/ImageField";
import { CLUB_SECTIONS } from "@/lib/clubSections";
import { normalizeStatsConfig } from "@/lib/statsSections";
import { inferTeamRelation, suggestParentClub } from "@/lib/teamRelations";

export function ProfilesPanel() {
  const [rows, setRows] = useState([]);
  const load = () => supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, []);
  const setRole = async (r, role) => { await supabase.from("profiles").update({ role }).eq("id", r.id); load(); };
  return (<div><h2 className="mb-4 text-lg font-bold">Profils</h2>
    <div className="divide-y divide-line/10 rounded-xl border border-line/10">
      {rows.map((r) => <div key={r.id} className="flex items-center gap-3 p-3 text-sm"><span className="flex-1 truncate">{r.username || String(r.id).slice(0, 8)}</span>
        <select value={r.role} onChange={(e) => setRole(r, e.target.value)} className="rounded border border-line/10 bg-surface2 px-2 py-1 text-xs"><option>member</option><option>admin</option></select></div>)}
      {rows.length === 0 && <div className="p-4 text-sm text-muted">Aucun profil.</div>}
    </div></div>);
}

export function ReportsPanel() {
  const [rows, setRows] = useState([]);
  const load = () => supabase.from("reports").select("*").eq("status", "open").order("created_at", { ascending: false }).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, []);
  const act = async (r, status) => { await supabase.from("reports").update({ status }).eq("id", r.id); load(); };
  return (<div><h2 className="mb-4 text-lg font-bold">Signalements <span className="text-sm font-normal text-muted">({rows.length})</span></h2>
    <div className="divide-y divide-line/10 rounded-xl border border-line/10">
      {rows.map((r) => <div key={r.id} className="flex items-center gap-3 p-3 text-sm"><span className="flex-1">{r.target_type} · {r.reason || "(sans motif)"}</span>
        <button onClick={() => act(r, "resolved")} className="text-green-400">Traiter</button><button onClick={() => act(r, "dismissed")} className="text-muted">Ignorer</button></div>)}
      {rows.length === 0 && <div className="p-4 text-sm text-muted">Aucun signalement.</div>}
    </div></div>);
}

const JOB_LABELS = { "football.sync": "🔄 Synchroniser (import complet)", "football.live-sync": "🔄 Live (scores)", "football.discover-belgians": "🔎 Découvrir les Belges", "football.track-belgians": "📊 MAJ Belges suivis", "football.squads": "👥 Effectifs (joueurs)", "football.events": "⚽ Événements de match", "football.coaches": "🧑‍🏫 Entraîneurs" };

export function JobsPanel() {
  const [rows, setRows] = useState([]);
  const [season, setSeason] = useState("2025-2026");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState("");
  const [comps, setComps] = useState([]);
  const [compId, setCompId] = useState("");   // "" = toutes
  const load = () => supabase.from("job_runs").select("*").order("started_at", { ascending: false }).limit(30).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); supabase.from("competitions").select("id,name").order("name").then(({ data }) => setComps(data || [])); }, []);
  const run = async (key) => {
    setBusy(key); setMsg("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/admin/run-job", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ key, season, competitionId: compId || null }),
      });
      const txt = await r.text();
      if (!r.ok) throw new Error(txt || ("HTTP " + r.status));
      let d; try { d = JSON.parse(txt); } catch { d = { detail: txt }; }
      setMsg(`✓ ${key} : ${d.detail || "ok"}`);
    } catch (e) { setMsg(`✗ ${key} : ${e.message}`); }
    setBusy(null); load();
  };
  return (<div>
    <h2 className="mb-4 text-lg font-bold">Jobs & synchronisation</h2>
    <p className="mb-3 text-xs text-muted">Le job Entraîneurs coûte environ une requête API par club. Choisis une compétition pour préserver le quota gratuit.</p>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <select value={compId} onChange={(e) => setCompId(e.target.value)} className="rounded border border-line/10 bg-surface2 px-2 py-1 text-sm"><option value="">Toutes les compétitions</option>{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <label className="text-xs text-muted">Saison</label>
      <input value={season} onChange={(e) => setSeason(e.target.value)} className="w-28 rounded border border-line/10 bg-surface2 px-2 py-1 text-sm" />
      {jobKeys().map((k) => (
        <button key={k} disabled={!!busy} onClick={() => run(k)} className="rounded bg-accent px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          {(JOB_LABELS[k] || k)}{busy === k ? " …" : ""}
        </button>
      ))}
    </div>
    {msg && <p className="mb-3 rounded border border-line/10 bg-surface p-2 text-sm text-muted">{msg}</p>}
    <div className="divide-y divide-line/10 rounded-xl border border-line/10">
      {rows.map((j) => <div key={j.id} className="flex items-center justify-between p-3 text-sm"><span>{j.job_key} · {new Date(j.started_at).toLocaleString()}</span><span className={j.status === "error" ? "text-red-400" : j.status === "ok" ? "text-green-400" : "text-muted"}>{j.status}{j.detail ? ` · ${j.detail}` : ""}</span></div>)}
      {rows.length === 0 && <div className="p-4 text-sm text-muted">Aucune exécution.</div>}
    </div>
  </div>);
}
export const SyncHistoryPanel = JobsPanel;

export function ProvidersPanel() {
  const [comps, setComps] = useState([]);
  useEffect(() => { supabase.from("competitions").select("id,name,provider").then(({ data }) => setComps(data || [])); }, []);
  return (<div><h2 className="mb-4 text-lg font-bold">Providers</h2>
    <p className="mb-3 text-xs text-muted">Chaque compétition peut avoir son provider (multi-sources). Les providers réels se branchent via le contrat football/providers.js.</p>
    <div className="divide-y divide-line/10 rounded-xl border border-line/10">
      {comps.map((c) => <div key={c.id} className="flex items-center justify-between p-3 text-sm"><span>{c.name}</span><span className="text-muted">{c.provider || "— (manuel)"}</span></div>)}
      {comps.length === 0 && <div className="p-4 text-sm text-muted">Aucune compétition. Crée-en dans Football → Compétitions.</div>}
    </div></div>);
}

export function SettingsInfo({ which }) {
  const data = which === "modules" ? siteConfig.modules : which === "flags" ? siteConfig.flags : siteConfig;
  return (<div><h2 className="mb-4 text-lg font-bold capitalize">{which}</h2>
    <pre className="overflow-auto rounded-xl border border-line/10 bg-surface p-4 text-xs text-muted">{JSON.stringify(data, null, 2)}</pre>
    <p className="mt-2 text-xs text-muted">Édition via config/site.js (repo) pour l'instant ; panneau d'édition en admin à venir.</p></div>);
}

export function Placeholder({ title }) {
  return <div><h2 className="mb-2 text-lg font-bold capitalize">{title}</h2><p className="text-sm text-muted">Panneau en place — version minimale. On l'enrichit au fil du chantier.</p></div>;
}

export function LabelsPanel() {
  const [labels, setLabels] = useState({});
  const [nk, setNk] = useState(""); const [nv, setNv] = useState("");
  const load = () => supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data }) => setLabels((data?.data && data.data.labels) || {}));
  useEffect(() => { load(); }, []);
  const persist = async (obj) => { const { data } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle(); await supabase.from("site_settings").update({ data: { ...(data?.data || {}), labels: obj } }).eq("id", 1); setLabels(obj); };
  const setVal = (k, v) => setLabels((o) => ({ ...o, [k]: v }));
  const add = () => { if (!nk.trim()) return; persist({ ...labels, [nk.trim()]: nv }); setNk(""); setNv(""); };
  const del = (k) => { const o = { ...labels }; delete o[k]; persist(o); };
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold">Textes</h2>
      <p className="mb-4 text-xs text-muted">Surcharge les libellés de l'interface (clé → texte). Vide = le texte par défaut du code s'applique.</p>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input value={nk} onChange={(e) => setNk(e.target.value)} placeholder="clé (ex. comp.kicker)" className="rounded border border-line/10 bg-surface2 px-2 py-1 text-sm" />
        <input value={nv} onChange={(e) => setNv(e.target.value)} placeholder="texte" className="rounded border border-line/10 bg-surface2 px-2 py-1 text-sm" />
        <button onClick={add} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">+ Ajouter</button>
      </div>
      <div className="space-y-1">
        {Object.entries(labels).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-sm">
            <span className="w-40 shrink-0 truncate text-xs text-muted">{k}</span>
            <input value={v} onChange={(e) => setVal(k, e.target.value)} onBlur={() => persist(labels)} className="flex-1 rounded border border-line/10 bg-surface2 px-2 py-1" />
            <button onClick={() => del(k)} className="text-red-400">×</button>
          </div>
        ))}
        {Object.keys(labels).length === 0 && <p className="text-sm text-muted">Aucun texte personnalisé (les défauts s'appliquent).</p>}
      </div>
    </div>
  );
}


export function TilesPanel() {
  const KEYS = [["topscorer", "Meilleur buteur"], ["topassist", "Meilleur passeur"], ["cleansheet", "Clean sheets"], ["note", "Meilleure note"], ["upcoming", "Prochains matchs"]];
  const [cfg, setCfg] = useState({});
  const load = () => supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data }) => setCfg((data?.data && data.data.tiles) || {}));
  useEffect(() => { load(); }, []);
  const persist = async (obj) => { const { data } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle(); await supabase.from("site_settings").update({ data: { ...(data?.data || {}), tiles: obj } }).eq("id", 1); setCfg(obj); };
  const upd = (k, field, v) => ({ ...cfg, [k]: { ...(cfg[k] || {}), [field]: v } });
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold">Tuiles (fonds)</h2>
      <p className="mb-4 text-xs text-muted">Fond décoratif par tuile (image), overlay sombre pour la lisibilité. Le texte/les données restent par-dessus. Vide = accent par défaut. Non touché par les syncs.</p>
      <div className="space-y-3">
        {KEYS.map(([k, label]) => { const t = cfg[k] || {}; return (
          <div key={k} className="rounded-xl border border-line/10 p-3">
            <div className="mb-2 font-semibold">{label}</div>
            <div className="flex flex-wrap items-end gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={t.enabled !== false} onChange={(e) => persist(upd(k, "enabled", e.target.checked))} />Fond/accent actif</label>
              <div><div className="mb-1 text-xs text-muted">Image de fond</div><ImageField value={t.background_url} onChange={(v) => persist(upd(k, "background_url", v))} /></div>
              <div><div className="mb-1 text-xs text-muted">Overlay (0–1)</div><input type="number" step="0.1" min="0" max="1" value={t.overlay ?? ""} onChange={(e) => setCfg(upd(k, "overlay", e.target.value === "" ? undefined : Number(e.target.value)))} onBlur={() => persist(cfg)} className="w-20 rounded border border-line/10 bg-surface2 px-2 py-1" /></div>
              <div><div className="mb-1 text-xs text-muted">Accent</div><input type="color" value={t.accent || "#f4c430"} onChange={(e) => persist(upd(k, "accent", e.target.value))} className="h-8 w-10 rounded bg-transparent" /></div>
            </div>
          </div>); })}
      </div>
    </div>
  );
}


export function ClubSectionsPanel() {
  const [items, setItems] = useState(CLUB_SECTIONS.map((s, i) => ({ ...s, enabled: true, order: i })));
  useEffect(() => { supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data }) => {
    const conf = (data?.data && data.data.club_sections) || {};
    setItems(CLUB_SECTIONS.map((s, i) => ({ ...s, label: conf[s.key]?.label || s.label, enabled: conf[s.key]?.enabled !== false, order: conf[s.key]?.order ?? i })).sort((a, b) => a.order - b.order));
  }); }, []);
  const persist = async (next) => { const arr = next.map((s, i) => ({ ...s, order: i })); setItems(arr); const { data } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle(); const obj = Object.fromEntries(arr.map((s) => [s.key, { enabled: s.enabled, order: s.order, label: s.label }])); await supabase.from("site_settings").update({ data: { ...(data?.data || {}), club_sections: obj } }).eq("id", 1); };
  const toggle = (i) => persist(items.map((s, j) => (j === i ? { ...s, enabled: !s.enabled } : s)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= items.length) return; const a = [...items]; [a[i], a[j]] = [a[j], a[i]]; persist(a); };
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold">Fiche club — sections</h2>
      <p className="mb-4 text-xs text-muted">Active/masque et ordonne les sections de la fiche club publique. Masquer ne supprime aucune donnée. (Les visiteurs peuvent aussi plier/déplier chaque section.)</p>
      <div className="space-y-1">
        {items.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 rounded border border-line/10 bg-surface p-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.enabled} onChange={() => toggle(i)} />Visible</label>
            <input value={s.label} onChange={(event) => setItems(items.map((item, itemIndex) => itemIndex === i ? { ...item, label: event.target.value } : item))} onBlur={() => persist(items)} className="min-w-0 flex-1 rounded border border-line/10 bg-surface2 px-2 py-1" />
            <button onClick={() => move(i, -1)} className="px-1 text-muted hover:text-content">↑</button>
            <button onClick={() => move(i, 1)} className="px-1 text-muted hover:text-content">↓</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsSectionsPanel() {
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState("");
  const [allConfig, setAllConfig] = useState({});
  const [draft, setDraft] = useState(normalizeStatsConfig());
  const [status, setStatus] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("competitions").select("id,name").order("position", { ascending: true, nullsFirst: false }),
      supabase.from("site_settings").select("data").eq("id", 1).maybeSingle(),
    ]).then(([competitionResult, settingsResult]) => {
      const rows = competitionResult.data || [];
      const stored = (settingsResult.data?.data && settingsResult.data.data.competition_stats) || {};
      setCompetitions(rows); setAllConfig(stored);
      const first = rows[0]?.id || "default"; setCompetitionId(first); setDraft(normalizeStatsConfig(stored[first] || stored.default || {}));
    });
  }, []);

  const selectCompetition = (id) => { setCompetitionId(id); setDraft(normalizeStatsConfig(allConfig[id] || allConfig.default || {})); setStatus(""); };
  const updateSection = (key, field, value) => setDraft((current) => ({ ...current, sections: current.sections.map((section) => section.key === key ? { ...section, [field]: value } : section) }));
  const move = (index, direction) => setDraft((current) => { const next = [...current.sections]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return { ...current, sections: next }; });
  const save = async () => {
    setStatus("saving");
    const storedSections = Object.fromEntries(draft.sections.map((section, index) => [section.key, { enabled: section.enabled, order: index, label: section.label, accent: section.accent }]));
    const nextAll = { ...allConfig, [competitionId]: { title: draft.title, subtitle: draft.subtitle, sections: storedSections } };
    const { data } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle();
    const { error } = await supabase.from("site_settings").update({ data: { ...(data?.data || {}), competition_stats: nextAll } }).eq("id", 1);
    if (error) setStatus("error"); else { setAllConfig(nextAll); setDraft(normalizeStatsConfig(nextAll[competitionId])); setStatus("saved"); }
  };

  return (
    <div>
      <h2 className="mb-2 text-lg font-bold">Page Stats</h2>
      <p className="mb-4 text-xs text-muted">Chaque compétition possède ses propres textes, blocs, couleurs et ordre. Les chiffres restent calculés automatiquement.</p>
      <select value={competitionId} onChange={(event) => selectCompetition(event.target.value)} className="mb-4 w-full rounded-xl border border-line/10 bg-surface2 px-3 py-2 text-sm sm:w-auto">
        {competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name}</option>)}
      </select>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted">Titre<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-3 py-2 text-sm normal-case tracking-normal text-content" /></label>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted">Sous-titre<input value={draft.subtitle} onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-3 py-2 text-sm normal-case tracking-normal text-content" /></label>
      </div>
      <div className="space-y-2">
        {draft.sections.map((section, index) => (
          <div key={section.key} className="grid gap-2 rounded-xl border border-line/10 bg-surface p-3 sm:grid-cols-[auto_minmax(180px,1fr)_90px_auto] sm:items-center">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={section.enabled} onChange={(event) => updateSection(section.key, "enabled", event.target.checked)} />Visible</label>
            <input value={section.label} onChange={(event) => updateSection(section.key, "label", event.target.value)} className="rounded border border-line/10 bg-surface2 px-2 py-1.5 text-sm" />
            <label className="flex items-center gap-2 text-xs text-muted"><input type="color" value={section.accent} onChange={(event) => updateSection(section.key, "accent", event.target.value)} className="h-8 w-10 rounded bg-transparent" />Accent</label>
            <div className="flex justify-end gap-1"><button onClick={() => move(index, -1)} className="rounded px-2 py-1 text-muted hover:bg-white/5 hover:text-content">↑</button><button onClick={() => move(index, 1)} className="rounded px-2 py-1 text-muted hover:bg-white/5 hover:text-content">↓</button></div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3"><button onClick={save} disabled={status === "saving"} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{status === "saving" ? "Enregistrement…" : "Enregistrer"}</button>{status === "saved" && <span className="text-sm text-green-400">Enregistré</span>}{status === "error" && <span className="text-sm text-red-400">Erreur d'enregistrement</span>}</div>
    </div>
  );
}

export function TeamRelationsPanel() {
  const [clubs, setClubs] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState("");
  const load = () => supabase.from("clubs").select("id,name,short_name,logo_url,team_type,parent_club_id").order("name").then(({ data }) => setClubs(data || []));
  useEffect(() => { load(); }, []);
  const firstTeams = useMemo(() => clubs.filter((club) => (club.team_type || "first_team") === "first_team"), [clubs]);
  const rows = useMemo(() => clubs.filter((club) => showAll || club.parent_club_id || (club.team_type && club.team_type !== "first_team") || inferTeamRelation(club.name).detected), [clubs, showAll]);
  const updateLocal = (id, patch) => setClubs((current) => current.map((club) => club.id === id ? { ...club, ...patch } : club));
  const save = async (club) => {
    setStatus(`saving:${club.id}`);
    const { error } = await supabase.from("clubs").update({ team_type: club.team_type || "first_team", parent_club_id: club.parent_club_id || null }).eq("id", club.id);
    setStatus(error ? `error:${club.id}` : `saved:${club.id}`); if (!error) load();
  };
  const applySuggestion = (club) => {
    const inferred = inferTeamRelation(club.name); const parent = suggestParentClub(club, clubs);
    updateLocal(club.id, { team_type: inferred.type, parent_club_id: parent?.id || club.parent_club_id || null });
  };
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Réserves et U23</h2><p className="mt-1 max-w-2xl text-xs text-muted">Les noms sont analysés localement, sans appel API. Une suggestion n'est jamais enregistrée sans ta validation.</p></div><label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />Afficher tous les clubs</label></div>
      <div className="space-y-2">
        {rows.map((club) => { const inferred = inferTeamRelation(club.name); const suggested = suggestParentClub(club, clubs); return (
          <div key={club.id} className="rounded-xl border border-line/10 bg-surface p-3">
            <div className="mb-3 flex items-center gap-3">{club.logo_url && <img src={club.logo_url} className="h-9 w-9 object-contain" alt="" />}<div className="min-w-0 flex-1"><div className="truncate font-semibold">{club.name}</div><div className="text-[11px] text-muted">{inferred.detected ? `Détecté : ${inferred.type}` : "Aucun suffixe réserve/U23 détecté"}{suggested ? ` · parent proposé : ${suggested.name}` : ""}</div></div>{inferred.detected && <button onClick={() => applySuggestion(club)} className="rounded-lg border border-accent/30 px-2 py-1 text-xs text-accent hover:bg-accent/10">Appliquer la suggestion</button>}</div>
            <div className="grid gap-2 sm:grid-cols-[150px_minmax(180px,1fr)_auto]">
              <select value={club.team_type || "first_team"} onChange={(event) => updateLocal(club.id, { team_type: event.target.value, parent_club_id: event.target.value === "first_team" ? null : club.parent_club_id })} className="rounded border border-line/10 bg-surface2 px-2 py-1.5 text-sm"><option value="first_team">Équipe première</option><option value="reserve">Réserve</option><option value="u23">U23</option><option value="women">Féminines</option></select>
              <select value={club.parent_club_id || ""} disabled={(club.team_type || "first_team") === "first_team"} onChange={(event) => updateLocal(club.id, { parent_club_id: event.target.value || null })} className="rounded border border-line/10 bg-surface2 px-2 py-1.5 text-sm disabled:opacity-40"><option value="">— Club parent —</option>{firstTeams.filter((parent) => parent.id !== club.id).map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</select>
              <button onClick={() => save(club)} disabled={status === `saving:${club.id}`} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">{status === `saving:${club.id}` ? "…" : status === `saved:${club.id}` ? "Enregistré" : "Enregistrer"}</button>
            </div>{status === `error:${club.id}` && <div className="mt-2 text-xs text-red-400">Impossible d'enregistrer cette relation.</div>}
          </div>); })}
        {rows.length === 0 && <div className="rounded-xl border border-dashed border-line/20 p-6 text-center text-sm text-muted">Aucune réserve ou U23 détectée. Active « Afficher tous les clubs » pour créer une relation manuellement.</div>}
      </div>
    </div>
  );
}
