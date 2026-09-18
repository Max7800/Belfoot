"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, Shield, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function Empty({ children }) {
  return <p className="rounded-lg border border-dashed border-line/15 p-3 text-xs text-muted">{children}</p>;
}

export default function PlayerWorkspace({ playerId }) {
  const [memberships, setMemberships] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("player_team_seasons").select("id, club_id, season, season_start_year, squad_role, membership_type, is_primary, active, clubs(name)").eq("player_id", playerId).order("season_start_year", { ascending: false }),
      supabase.from("player_season_stats").select("id, club_id, competition_id, season, appearances, lineups, minutes, goals, assists, clubs(name), competitions(name)").eq("player_id", playerId).order("season", { ascending: false }),
    ]).then(([membershipResult, statsResult]) => {
      setMemberships(membershipResult.data || []);
      setStats(statsResult.data || []);
      setLoading(false);
    });
  }, [playerId]);

  if (loading) return <div className="mt-6 rounded-xl border border-line/10 p-5 text-sm text-muted">Chargement du parcours…</div>;

  return (
    <section className="mt-7 border-t border-line/10 pt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Espace joueur</p><h3 className="mt-1 text-lg font-bold">Affectations et carrière</h3><p className="mt-1 text-xs text-muted">Vue consolidée de la personne, sans mélanger club actuel et historique.</p></div>
        <Link href={`/players/${playerId}`} target="_blank" className="inline-flex items-center gap-2 rounded-lg border border-line/10 px-3 py-2 text-xs text-muted hover:text-content">Voir la fiche publique <ExternalLink size={13} /></Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-line/10 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Shield size={16} className="text-accent" /><h4 className="font-bold">Affectations</h4><span className="text-xs text-muted">{memberships.length}</span></div><Link href={`/admin/playerMemberships?player_id=${playerId}`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">Gérer <ArrowRight size={12} /></Link></div>
          <div className="space-y-2">
            {memberships.slice(0, 8).map((membership) => <div key={membership.id} className="flex items-center gap-3 rounded-lg border border-line/10 bg-bg/30 p-3 text-xs"><span className={`h-2 w-2 shrink-0 rounded-full ${membership.active ? "bg-green-400" : "bg-muted/50"}`} /><span className="min-w-0 flex-1"><b className="block truncate text-sm">{membership.clubs?.name || "Équipe inconnue"}</b><span className="text-muted">{membership.season || "Saison inconnue"} · {membership.squad_role || "groupe inconnu"} · {membership.membership_type || "affectation"}</span></span>{membership.is_primary && <span className="rounded bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent">Principale</span>}</div>)}
            {memberships.length === 0 && <Empty>Aucune affectation saisonnière. Le club actuel reste visible plus haut, mais il ne constitue pas un historique.</Empty>}
            {memberships.length > 8 && <p className="text-center text-[11px] text-muted">+ {memberships.length - 8} autre{memberships.length - 8 > 1 ? "s" : ""} dans la vue complète</p>}
          </div>
        </div>

        <div className="rounded-xl border border-line/10 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Trophy size={16} className="text-accent" /><h4 className="font-bold">Carrière</h4><span className="text-xs text-muted">{stats.length}</span></div><Link href={`/admin/playerCareerStats?player_id=${playerId}`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">Gérer <ArrowRight size={12} /></Link></div>
          <div className="overflow-hidden rounded-lg border border-line/10">
            {stats.slice(0, 8).map((stat) => <div key={stat.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-line/10 p-3 text-xs last:border-b-0"><span className="min-w-0"><b className="block truncate text-sm">{stat.clubs?.name || "Club historique inconnu"}</b><span className="block truncate text-muted">{stat.season || "—"} · {stat.competitions?.name || "Compétition inconnue"}</span></span><span className="flex items-center gap-3 text-right"><span><b className="block text-sm">{stat.appearances || 0}</b><small className="text-[9px] uppercase text-muted">matchs</small></span><span><b className="block text-sm">{stat.goals || 0}</b><small className="text-[9px] uppercase text-muted">buts</small></span><span><b className="block text-sm">{stat.assists || 0}</b><small className="text-[9px] uppercase text-muted">passes</small></span></span></div>)}
            {stats.length === 0 && <Empty>Aucune statistique de carrière enregistrée.</Empty>}
          </div>
          {stats.length > 8 && <p className="mt-2 text-center text-[11px] text-muted">+ {stats.length - 8} autre{stats.length - 8 > 1 ? "s" : ""} dans la vue complète</p>}
        </div>
      </div>
    </section>
  );
}
