"use client";
// Éléments partagés par les pages « Plan d'import », « Saisons » et
// « Entretien des données » (anciennement une seule page).
import { ChevronDown, Eye, EyeOff, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// Certains anciens imports ont créé une ligne éditoriale puis une ligne API
// pour le même provider/id. Elles doivent être consolidées en base plus tard,
// mais le plan ne peut jamais les proposer deux fois entre-temps.
export function distinctProviderCompetitions(rows, seasons = []) {
  const grouped = new Map();
  for (const competition of rows) {
    const key = competition.provider && competition.external_id ? `${competition.provider}:${competition.external_id}` : competition.id;
    const current = grouped.get(key);
    const score = seasons.filter((season) => season.competition_id === competition.id).length * 100
      + (competition.public_visible !== false ? 10 : 0)
      + (/^(jupiler|uefa)/i.test(competition.name || "") ? 1 : 0);
    if (!current || score > current.score) grouped.set(key, { competition, score });
  }
  return [...grouped.values()].map((entry) => entry.competition);
}

// `ext` est nécessaire au rangement par pays de la catégorie « Étranger ».
export const PLAN_COMPETITION_COLUMNS = "id,name,external_id,provider,public_visible,competition_scope,ext";

async function adminPost(path, payload, fallbackMessage) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session administrateur expirée.");
  const response = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || fallbackMessage);
    error.report = result.report;
    throw error;
  }
  return result;
}

export const requestReadiness = (payload) => adminPost("/api/admin/season-readiness", payload, "Le contrôle de préparation a échoué.");
export const requestMaintenance = (payload) => adminPost("/api/admin/data-maintenance", payload, "L’analyse des données a échoué.");

// ── Contrôles d'affichage (préférences locales, jamais enregistrées dans le plan) ──

export function SearchField({ value, onChange, placeholder = "Rechercher…" }) {
  return <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm"><Search className="h-4 w-4 shrink-0 text-muted" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-content outline-none" /></label>;
}

export function ToggleChip({ checked, onChange, children, title }) {
  return <button type="button" onClick={() => onChange(!checked)} aria-pressed={checked} title={title} className={`rounded-lg border px-3 py-2 text-xs font-bold ${checked ? "border-accent/40 bg-accent/10 text-accent" : "border-line/15 text-muted hover:text-content"}`}>{children}</button>;
}

export function HideButton({ hidden, onToggle, label }) {
  return <button type="button" onClick={onToggle} title={hidden ? `Réafficher ${label}` : `Masquer ${label} (affichage seulement, rien n’est retiré du plan)`} className="rounded-lg border border-line/10 p-1.5 text-muted hover:text-content">{hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>;
}

// Groupe repliable dont l'état ouvert/fermé est mémorisé (préférence locale).
export function Group({ id, openGroups, setOpenGroups, defaultOpen = false, header, children, className = "" }) {
  const open = openGroups[id] ?? defaultOpen;
  return <section className={`overflow-hidden rounded-2xl border border-line/10 ${className}`}>
    <button type="button" onClick={() => setOpenGroups((current) => ({ ...current, [id]: !open }))} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="min-w-0 flex-1">{header}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="border-t border-line/10">{children}</div>}
  </section>;
}
