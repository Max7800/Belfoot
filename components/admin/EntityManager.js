"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import SaveStatus from "@/components/ui/SaveStatus";
import ImageField from "@/components/ui/ImageField";
import { slugify } from "@/lib/slugify";

const POS = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };

export default function EntityManager({ spec }) {
  const { table, title, singular, fields, hasSource } = spec;
  const [rows, setRows] = useState([]);
  const [rel, setRel] = useState({});
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState("idle");
  const [q, setQ] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [quickFilters, setQuickFilters] = useState({});
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = spec.pageSize || 0;
  const relFields = useMemo(() => fields.filter((f) => f.type === "relation"), [fields]);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from(table).select("*", pageSize ? { count: "exact" } : undefined);
    if (spec.search && q.trim()) query = query.ilike(spec.searchField || "name", `%${q.trim()}%`);
    if (spec.groupBy && groupFilter !== "all") {
      query = groupFilter === "none" ? query.is(spec.groupBy.field, null) : query.eq(spec.groupBy.field, groupFilter);
    }
    for (const filter of spec.quickFilters || []) {
      const value = quickFilters[filter.key];
      if (value === undefined || value === "all") continue;
      if (value === "none") query = query.is(filter.key, null);
      else query = query.eq(filter.key, filter.type === "bool" ? value === "true" : value);
    }
    if (spec.orderBy) query = query.order(spec.orderBy, { ascending: spec.orderAsc !== false, nullsFirst: false });
    if (pageSize) query = query.range(page * pageSize, page * pageSize + pageSize - 1);
    const { data, count } = await query;
    setRows(data || []);
    setTotal(count ?? data?.length ?? 0);
    setLoading(false);
  }, [groupFilter, page, pageSize, q, quickFilters, spec, table]);

  useEffect(() => {
    const timer = setTimeout(load, q.trim() ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    const done = new Set();
    relFields.forEach(async (f) => {
      if (done.has(f.table)) return; done.add(f.table);
      const sel = f.labelCol === "id" ? "id" : `id, ${f.labelCol}`;
      const { data } = await supabase.from(f.table).select(sel).limit(1000);
      setRel((prev) => ({ ...prev, [f.table]: (data || []).map((r) => ({ id: r.id, label: f.labelCol === "id" ? String(r.id).slice(0, 8) : String(r[f.labelCol] ?? r.id) })) }));
    });
  }, [relFields, table]);

  useEffect(() => { setPage(0); }, [groupFilter, q, quickFilters, table]);

  const save = async () => {
    setStatus("saving");
    const row = { ...editing };
    if (spec.slugFrom && !row.slug) row.slug = slugify(row[spec.slugFrom] || "");
    const { error } = await supabase.from(table).upsert(row);
    if (error) { setStatus("error"); alert(error.message); } else { setStatus("saved"); setEditing(null); load(); }
    setTimeout(() => setStatus("idle"), 2000);
  };
  const remove = async (r) => { if (!confirm("Supprimer ?")) return; await supabase.from(table).delete().eq("id", r.id); load(); };
  const setV = (k, v) => setEditing((e) => ({ ...e, [k]: v }));
  const relLabelOf = (relTable, id) => (rel[relTable] || []).find((o) => o.id === id)?.label || "Sans club / non associé";
  const rowLabel = (r) => {
    if (table === "player_team_seasons") return `${relLabelOf("players", r.player_id)} → ${relLabelOf("clubs", r.club_id)} · ${r.season || "saison ?"}`;
    if (table === "player_season_stats") return `${relLabelOf("players", r.player_id)} · ${relLabelOf("clubs", r.club_id)} · ${r.season || "saison ?"}`;
    return r.name || r.label || r.title || (r.id ? String(r.id).slice(0, 8) : "—");
  };

  const Row = ({ it }) => (
    <div className="flex items-center gap-3 p-3">
      {(it.logo_url || it.photo_url) && <img src={it.logo_url || it.photo_url} alt="" className="h-8 w-8 rounded object-cover" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{rowLabel(it)}</div>
        <div className="text-xs text-muted">
          {spec.groupBy ? `${relLabelOf(spec.groupBy.relTable, it[spec.groupBy.field])} · ` : ""}{it.position ? it.position + " · " : ""}{hasSource ? (it.locked ? "🔒 manuel" : (it.source || "manual")) : ""}{it.tracked ? " · suivi" : ""}
        </div>
      </div>
      <button onClick={() => setEditing({ ...it })} className="shrink-0 text-xs text-muted hover:text-content sm:text-sm">Éditer</button>
      <button onClick={() => remove(it)} className="hidden shrink-0 text-xs text-red-400 sm:block sm:text-sm">Suppr.</button>
    </div>
  );

  if (editing) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing.id ? "Modifier" : "Nouveau"} — {singular || title}</h2>
          <div className="flex items-center gap-3"><SaveStatus status={status} />
            <button onClick={() => setEditing(null)} className="text-sm text-muted">Annuler</button>
            <button onClick={save} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">Enregistrer</button></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => <Field key={f.key} f={f} value={editing[f.key]} onChange={(v) => setV(f.key, v)} options={rel[f.table]} />)}
        </div>
        {hasSource && (
          <div className="mt-4 rounded-lg border border-line/10 p-3 text-sm">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Données externes</div>
            <div className="flex flex-wrap items-center gap-4 text-muted">
              <span>source : <b className="text-content">{editing.source || "manual"}</b></span>
              <span>external_id : {editing.external_id || "—"}</span>
              <span>synchro : {editing.synced_at ? new Date(editing.synced_at).toLocaleString() : "—"}</span>
              <label className="flex items-center gap-2 text-content"><input type="checkbox" checked={!!editing.locked} onChange={(e) => setV("locked", e.target.checked)} />🔒 verrouillé</label>
            </div>
          </div>
        )}
      </div>
    );
  }

  // filtrage + regroupement
  const list = rows;
  const gb = spec.groupBy;
  let groups = null;
  if (gb && spec.grouped !== false) {
    const map = new Map();
    for (const r of list) { const key = r[gb.field] || "__none__"; (map.get(key) || map.set(key, []).get(key)).push(r); }
    groups = [...map.entries()].map(([key, items]) => ({
      key, label: key === "__none__" ? "Sans club / non associé" : relLabelOf(gb.relTable, key),
      items: items.sort((a, b) => (POS[a.position] ?? 9) - (POS[b.position] ?? 9) || (a.name || "").localeCompare(b.name || "")),
    })).sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-bold">{title}</h2>{pageSize > 0 && <p className="mt-0.5 text-xs text-muted">{total} entrée{total > 1 ? "s" : ""}</p>}</div>
        <div className="flex flex-wrap items-center gap-2">
          {spec.search && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom…" className="min-w-44 rounded border border-line/10 bg-surface2 px-3 py-2 text-xs" />}
          {gb && <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="rounded border border-line/10 bg-surface2 px-2 py-1 text-xs"><option value="all">Tous les clubs</option>{(rel[gb.relTable] || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}<option value="none">Sans club</option></select>}
          {(spec.quickFilters || []).map((filter) => <select key={filter.key} value={quickFilters[filter.key] ?? "all"} onChange={(event) => setQuickFilters((current) => ({ ...current, [filter.key]: event.target.value }))} className="rounded border border-line/10 bg-surface2 px-2 py-1 text-xs"><option value="all">{filter.allLabel || filter.label}</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}
          <button onClick={() => setEditing({})} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">+ {singular || "Ajouter"}</button>
        </div>
      </div>
      {loading ? <div className="rounded-xl border border-line/10 p-8 text-center text-sm text-muted">Chargement…</div> : groups ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-1 flex items-center gap-2 text-sm font-bold">{g.label} <span className="text-xs font-normal text-muted">({g.items.length})</span></div>
              <div className="divide-y divide-line/10 rounded-xl border border-line/10">{g.items.map((it) => <Row key={it.id} it={it} />)}</div>
            </div>
          ))}
          {groups.length === 0 && <div className="p-4 text-sm text-muted">Aucune entrée.</div>}
        </div>
      ) : (
        <div className="divide-y divide-line/10 rounded-xl border border-line/10">
          {list.map((it) => <Row key={it.id} it={it} />)}
          {list.length === 0 && <div className="p-4 text-sm text-muted">Aucune entrée. (Se remplira surtout via provider / sync.)</div>}
        </div>
      )}
      {pageSize > 0 && total > pageSize && <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted"><span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} sur {total}</span><div className="flex gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="rounded-lg border border-line/10 px-3 py-2 text-content disabled:opacity-30">Précédent</button><button type="button" disabled={(page + 1) * pageSize >= total} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-line/10 px-3 py-2 text-content disabled:opacity-30">Suivant</button></div></div>}
    </div>
  );
}

function RelationField({ value, options, onChange }) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const box = "w-full rounded border border-line/10 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent";
  const cur = (options || []).find((o) => o.id === value);
  const filtered = (options || []).filter((o) => o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  return (
    <div className="relative">
      <input value={open ? q : (cur?.label || "")} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setQ(""); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Rechercher…" className={box} />
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-line/10 bg-surface2 shadow-lg">
          <button type="button" onMouseDown={() => { onChange(null); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-sm text-muted hover:bg-surface">—</button>
          {filtered.map((o) => <button key={o.id} type="button" onMouseDown={() => { onChange(o.id); setOpen(false); }} className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-surface">{o.label}</button>)}
          {filtered.length === 0 && <div className="px-3 py-1.5 text-xs text-muted">Aucun résultat</div>}
        </div>
      )}
    </div>
  );
}

function Field({ f, value, onChange, options }) {
  const label = <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">{f.label}</label>;
  const box = "w-full rounded border border-line/10 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent";
  if (f.type === "bool") return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
  if (f.type === "image") return <div>{label}<ImageField value={value} onChange={onChange} /></div>;
  if (f.type === "color") return <div>{label}<div className="flex items-center gap-2"><input type="color" value={/^#[0-9a-f]{6}$/i.test(value || "") ? value : "#1e3a8a"} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 rounded bg-transparent" /><input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="#1e3a8a" className={box} /></div></div>;
  if (f.type === "relation") return <div>{label}<RelationField value={value} options={options} onChange={onChange} /></div>;
  if (f.type === "select") return <div>{label}<select value={value || ""} onChange={(e) => onChange(e.target.value)} className={box}><option value="">—</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>;
  if (f.type === "number") return <div>{label}<input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className={box} /></div>;
  if (f.type === "datetime") return <div>{label}<input type="datetime-local" value={value ? String(value).slice(0, 16) : ""} onChange={(e) => onChange(e.target.value || null)} className={box} /></div>;
  if (f.type === "date") return <div>{label}<input type="date" value={value ? String(value).slice(0, 10) : ""} onChange={(e) => onChange(e.target.value || null)} className={box} /></div>;
  if (f.type === "zones") {
    const arr = Array.isArray(value) ? value : [];
    const upd = (i, k, v) => onChange(arr.map((z, j) => (j === i ? { ...z, [k]: v } : z)));
    return (<div>{label}<p className="mb-2 text-xs text-muted">Pour un seul club, mets le même rang dans les deux cases (ex. 16 → 16).</p><div className="space-y-2">{arr.map((z, i) => {
      const from = Number(z.from); const to = Number(z.to); const valid = Number.isFinite(from) && Number.isFinite(to) && from > 0 && to >= from;
      return (
      <div key={i} className={`rounded-xl border p-2 ${valid ? "border-line/10 bg-surface/40" : "border-red-500/40 bg-red-500/5"}`}>
        <div className="grid gap-2 sm:grid-cols-[minmax(160px,1fr)_56px_90px_90px_auto] sm:items-end">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Nom de la zone<input value={z.label || ""} onChange={(e) => upd(i, "label", e.target.value)} placeholder="Ex. Relégable" className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1.5 text-xs normal-case tracking-normal text-content" /></label>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Couleur<input type="color" value={z.color || "#3b82f6"} onChange={(e) => upd(i, "color", e.target.value)} className="mt-1 h-8 w-full rounded bg-transparent" /></label>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Du rang<input min="1" type="number" value={z.from ?? ""} onChange={(e) => upd(i, "from", e.target.value === "" ? null : Number(e.target.value))} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1.5 text-xs normal-case tracking-normal text-content" /></label>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Au rang<input min="1" type="number" value={z.to ?? ""} onChange={(e) => upd(i, "to", e.target.value === "" ? null : Number(e.target.value))} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1.5 text-xs normal-case tracking-normal text-content" /></label>
          <button type="button" onClick={() => onChange(arr.filter((_, j) => j !== i))} className="h-8 rounded px-2 text-red-400 hover:bg-red-500/10">Supprimer</button>
        </div>
        <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] ${valid ? "text-muted" : "text-red-300"}`}><span>{valid ? <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded" style={{ background: z.color || "#3b82f6" }} />{from === to ? `Uniquement le rang ${from}` : `Rangs ${from} à ${to}`}</span> : "La zone ne sera pas affichée : vérifie les deux rangs."}</span>{valid && from !== to && <button type="button" onClick={() => upd(i, "from", to)} className="rounded border border-line/20 px-2 py-1 text-content hover:border-accent/40">Seulement le rang {to}</button>}</div>
      </div>);
    })}
      <button type="button" onClick={() => onChange([...arr, { label: "", color: "#3b82f6", from: 1, to: 1 }])} className="rounded border border-line/20 px-2 py-1 text-xs text-muted hover:text-content">+ zone</button>
    </div></div>);
  }
  if (f.type === "phaseZones") {
    const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const rename = (oldName, nextName) => {
      const name = nextName.trim(); if (!name || name === oldName) return;
      const next = {}; for (const [key, zones] of Object.entries(obj)) next[key === oldName ? name : key] = zones;
      onChange(next);
    };
    const addPhase = () => {
      const name = window.prompt("Nom exact de la phase (ex. Regular Season)")?.trim();
      if (name && !Object.prototype.hasOwnProperty.call(obj, name)) onChange({ ...obj, [name]: [] });
    };
    return (<div className="sm:col-span-2">{label}<p className="mb-2 text-xs text-muted">Les noms doivent correspondre aux phases du provider. Une phase absente n'affiche aucune couleur.</p><div className="space-y-3">{Object.entries(obj).map(([phase, zones]) => (
      <div key={phase} className="rounded-xl border border-line/10 bg-surface/40 p-3">
        <div className="mb-2 flex items-center gap-2"><input defaultValue={phase} onBlur={(e) => rename(phase, e.target.value)} className="min-w-0 flex-1 rounded border border-line/10 bg-surface2 px-2 py-1 text-sm font-bold" /><button type="button" onClick={() => { const next = { ...obj }; delete next[phase]; onChange(next); }} className="text-sm text-red-400">Supprimer la phase</button></div>
        <Field f={{ key: `${f.key}.${phase}`, label: "Zones de cette phase", type: "zones" }} value={zones} onChange={(nextZones) => onChange({ ...obj, [phase]: nextZones })} />
      </div>
    ))}<button type="button" onClick={addPhase} className="rounded border border-line/20 px-3 py-1.5 text-xs text-muted hover:text-content">+ Ajouter une phase</button>{Object.keys(obj).length === 0 && <span className="ml-3 text-xs text-muted">Aucune zone : aucun rang ne sera coloré.</span>}</div></div>);
  }
  if (f.type === "honours") {
    const arr = Array.isArray(value) ? value : [];
    const upd = (index, key, nextValue) => onChange(arr.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: nextValue } : item));
    return (<div className="sm:col-span-2">{label}<p className="mb-2 text-xs text-muted">Une ligne par trophée. Les années restent libres : « 2019, 2022 » ou « 11 titres ».</p><div className="space-y-2">{arr.map((item, index) => (
      <div key={index} className="grid gap-2 rounded-xl border border-line/10 bg-surface/40 p-2 sm:grid-cols-[minmax(170px,1fr)_80px_minmax(160px,1fr)_auto]">
        <input value={item.title || ""} onChange={(e) => upd(index, "title", e.target.value)} placeholder="Compétition / trophée" className={box} />
        <input type="number" min="1" value={item.count ?? ""} onChange={(e) => upd(index, "count", e.target.value === "" ? null : Number(e.target.value))} placeholder="Nombre" className={box} />
        <input value={item.years || ""} onChange={(e) => upd(index, "years", e.target.value)} placeholder="Années ou précision" className={box} />
        <button type="button" onClick={() => onChange(arr.filter((_, itemIndex) => itemIndex !== index))} className="rounded px-2 text-red-400 hover:bg-red-500/10">Supprimer</button>
      </div>
    ))}<button type="button" onClick={() => onChange([...arr, { title: "", count: 1, years: "" }])} className="rounded border border-line/20 px-3 py-1.5 text-xs text-muted hover:text-content">+ Ajouter un trophée</button></div></div>);
  }
  if (f.type === "textarea") return <div>{label}<textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} className={box} /></div>;
  return <div>{label}<input value={value || ""} onChange={(e) => onChange(e.target.value)} className={box} /></div>;
}
