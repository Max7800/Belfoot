"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, ListOrdered, Shield, Sparkles, Trophy, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useRankings } from "@/lib/rankings";
import { getCompetitionType } from "@/lib/competitionType";
import { competitionPath } from "@/lib/competitionRoutes";
import { useCompetitionHub } from "@/lib/competitionHub";
import { useLabels } from "@/lib/labels";
import { supabase } from "@/lib/supabaseClient";

const FLAG = { Belgium: "🇧🇪", France: "🇫🇷", England: "🏴", Spain: "🇪🇸", Italy: "🇮🇹", Germany: "🇩🇪", Netherlands: "🇳🇱", Portugal: "🇵🇹" };
const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
const safeOverlay = (value, fallback = 0.62) => value === null || value === undefined || value === "" ? fallback : Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : fallback;

export default function CompetitionsPage() {
  const L = useLabels();
  const hub = useCompetitionHub();
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const rankings = useRankings();

  useEffect(() => { (async () => {
    const [competitionsResult, matchesResult] = await Promise.all([
      supabase.from("competitions").select("*").order("name"),
      supabase.from("matches").select("competition_id,phase,round_raw"),
    ]);
    if (competitionsResult.error) throw competitionsResult.error;
    const byCompetition = {};
    for (const match of matchesResult.data || []) (byCompetition[match.competition_id] ||= []).push(match);
    const rows = (competitionsResult.data || []).filter((competition) => competition.public_visible !== false).map((competition) => ({
      ...competition,
      display_type: getCompetitionType(competition, byCompetition[competition.id] || []),
    })).sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (a.name || "").localeCompare(b.name || ""));
    setComps(rows); setLoading(false);
  })().catch((e) => { setError(e.message || String(e)); setLoading(false); }); }, []);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(56,189,248,.15),transparent_68%)]" />
      <header className="relative mb-6 overflow-hidden rounded-3xl border border-sky-400/15 bg-[linear-gradient(120deg,rgba(6,23,42,.98),rgba(9,35,59,.94),rgba(5,18,34,.98))] px-5 py-6 sm:px-8 sm:py-8">
        {hub.banner_url && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${hub.banner_url})` }} />}
        {hub.banner_url && <div className="absolute inset-0 bg-[#06172a]" style={{ opacity: safeOverlay(hub.overlay) }} />}
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:38px_38px]" />
        <Trophy className="pointer-events-none absolute -bottom-16 -right-5 h-48 w-48 text-white opacity-[0.025]" />
        <div className="relative max-w-2xl">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-amber-300"><Sparkles className="h-3.5 w-3.5" />{hub.kicker}</div>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">{hub.title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300 sm:text-[15px]">{hub.intro}</p>
        </div>
      </header>

      {(rankings.uefa.rank !== "" || rankings.uefa.points !== "") && (
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
          <div className="text-3xl">🇧🇪</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black uppercase tracking-wider text-amber-300">Coefficient UEFA — Belgique</div>
            <div className="mt-0.5 text-sm text-muted">Détermine les places belges en Coupes d'Europe (C1 / C3 / C4).</div>
          </div>
          <div className="flex-shrink-0 text-right">
            {rankings.uefa.rank !== "" && <div className="text-2xl font-black">{rankings.uefa.rank}<span className="text-sm text-muted">ᵉ</span> {rankings.uefa.trend === "up" ? <span className="text-emerald-400">▲</span> : rankings.uefa.trend === "down" ? <span className="text-red-400">▼</span> : ""}</div>}
            {rankings.uefa.points !== "" && <div className="text-xs text-muted">{rankings.uefa.points} pts</div>}
          </div>
        </div>
      )}

      {loading && <div className="grid gap-4 lg:grid-cols-2"><div className="h-80 animate-pulse rounded-3xl bg-surface" /><div className="h-80 animate-pulse rounded-3xl bg-surface" /></div>}
      {!loading && error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">Impossible de charger les compétitions : {error}</p>}
      {!loading && !error && comps.length === 0 && <p className="rounded-2xl border border-dashed border-line/20 bg-surface/50 p-8 text-center text-muted">Aucune compétition pour l'instant.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {comps.map((competition, index) => {
          const path = competitionPath(competition);
          const isCup = competition.display_type === "cup";
          const banner = competition.portal_background_url || competition.banner_url || "/competition-banner.png";
          const title = competition.portal_title?.trim() || competition.header_title?.trim() || competition.name;
          const subtitle = competition.portal_subtitle?.trim() || competition.header_subtitle?.trim() || (isCup ? L("competitions.cupFallback", "La coupe nationale, sans droit à l'erreur.") : L("competitions.leagueFallback", "Une saison entière pour écrire la hiérarchie."));
          const country = competition.ext?.country;
          const featured = index === 0;
          const borderColor = safeColor(competition.portal_border_color, isCup ? "#fcd34d" : index % 2 ? "#7dd3fc" : "#e879f9");
          return (
            <article
              key={competition.id}
              className={`group relative min-h-[340px] overflow-hidden rounded-3xl border bg-[#07182b] transition duration-300 hover:-translate-y-1 ${featured ? "lg:col-span-2 lg:min-h-[310px]" : ""}`}
              style={{ borderColor: `${borderColor}8c`, boxShadow: `0 26px 70px -48px ${borderColor}` }}
            >
              <div className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.025]" style={{ backgroundImage: `url(${banner})` }} />
              <div className="absolute inset-0 bg-[#061426]" style={{ opacity: safeOverlay(competition.portal_overlay, 0.35) }} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#061426] via-[#07182b]/85 to-black/15" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-90" style={{ background: `linear-gradient(90deg, transparent, ${borderColor}, transparent)` }} />
              <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full opacity-[0.15] blur-3xl" style={{ backgroundColor: borderColor }} />
              <Link href={path} className={`relative flex flex-col p-5 sm:p-6 ${featured ? "min-h-[270px] lg:min-h-[240px] lg:px-8" : "min-h-[270px]"}`}>
                <div className="flex items-start justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] backdrop-blur-sm" style={{ borderColor: `${borderColor}80`, color: borderColor }}>{isCup ? <Trophy className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}{isCup ? L("competitions.cup", "Coupe") : L("competitions.league", "Championnat")}</span>
                  <span className="text-sm text-white/75">{competition.ext?.country_flag ? <img src={competition.ext.country_flag} className="h-4 w-6 rounded-sm object-cover" alt="" /> : FLAG[country] || "🇧🇪"}</span>
                </div>
                <div className={`mt-auto flex items-end gap-4 ${featured ? "pt-12 lg:gap-6 lg:pt-8" : "pt-16"}`}>
                  {competition.logo_url && <div className={`flex shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 p-2 backdrop-blur-sm ${featured ? "h-20 w-20 lg:h-24 lg:w-24" : "h-20 w-20"}`}><img src={competition.logo_url} className="h-full w-full object-contain drop-shadow-xl" alt="" /></div>}
                  <div className="min-w-0 flex-1">
                    <h2 className={`font-black leading-none text-white ${featured ? "text-3xl sm:text-4xl lg:text-5xl" : "text-3xl sm:text-4xl"}`}>{title}</h2>
                    <p className={`mt-2 line-clamp-2 leading-5 text-white/70 ${featured ? "max-w-2xl text-sm sm:text-base" : "text-sm"}`}>{subtitle}</p>
                  </div>
                  {featured && <ArrowRight className="mb-2 hidden h-7 w-7 shrink-0 text-white/55 transition group-hover:translate-x-1 group-hover:text-white lg:block" />}
                </div>
              </Link>
              <div className="relative grid grid-cols-2 border-t border-white/10 bg-[#020b15]/60 p-2 backdrop-blur-md sm:grid-cols-4">
                <Link href={path} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-bold text-white/90 transition hover:bg-white/[0.08] hover:text-white"><ArrowRight className="h-3.5 w-3.5" />{L("comp.tab.overview", "Vue d'ensemble")}</Link>
                <Link href={`${path}?tab=matchs`} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-bold text-white/90 transition hover:bg-white/[0.08] hover:text-white"><CalendarDays className="h-3.5 w-3.5" />{L("nav.matchs", "Matchs")}</Link>
                <Link href={`${path}?tab=classement`} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-bold text-white/90 transition hover:bg-white/[0.08] hover:text-white"><ListOrdered className="h-3.5 w-3.5" />{isCup ? L("cup.rounds", "Tours") : L("nav.classement", "Classement")}</Link>
                <Link href={`${path}?tab=clubs`} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-bold text-white/90 transition hover:bg-white/[0.08] hover:text-white"><UsersRound className="h-3.5 w-3.5" />{L("nav.clubs", "Clubs")}</Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
