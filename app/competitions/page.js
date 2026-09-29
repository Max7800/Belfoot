"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Flag, Globe2, ListOrdered, Shield, Sparkles, Trophy, UsersRound } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRankings } from "@/lib/rankings";
import { formatCompetitionName, getCompetitionType, isEuropeanClubCompetition } from "@/lib/competitionType";
import { competitionPath } from "@/lib/competitionRoutes";
import { useCompetitionHub } from "@/lib/competitionHub";
import { useLabels } from "@/lib/labels";
import { supabase } from "@/lib/supabaseClient";

const FLAG = { Belgium: "🇧🇪", France: "🇫🇷", England: "🏴", Spain: "🇪🇸", Italy: "🇮🇹", Germany: "🇩🇪", Netherlands: "🇳🇱", Portugal: "🇵🇹" };
const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
const safeOverlay = (value, fallback = 0.62) => value === null || value === undefined || value === "" ? fallback : Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : fallback;

function competitionScope(competition) {
  if (["national", "europe", "international"].includes(competition?.competition_scope)) return competition.competition_scope;
  if (competition?.ext?.imported_for === "national-teams") return "international";
  return "national";
}

function CompetitionCard({ competition, index, L }) {
  const path = competitionPath(competition);
  const isCup = competition.display_type === "cup";
  const isHybrid = competition.display_type === "hybrid";
  const isEuropean = isEuropeanClubCompetition(competition);
  const isInternational = competitionScope(competition) === "international";
  const banner = competition.portal_background_url || competition.banner_url || "/competition-banner.png";
  const title = formatCompetitionName(competition.portal_title?.trim() || competition.header_title?.trim() || competition.name);
  const subtitle = competition.portal_subtitle?.trim() || competition.header_subtitle?.trim() || (isCup ? L("competitions.cupFallback", "La coupe, sans droit à l'erreur.") : isHybrid ? "Une phase de ligue avant les soirées à élimination directe." : L("competitions.leagueFallback", "Une saison entière pour écrire la hiérarchie."));
  const country = competition.ext?.country;
  const featured = index === 0;
  const borderColor = safeColor(competition.portal_border_color, isCup ? "#fcd34d" : isHybrid ? "#818cf8" : index % 2 ? "#7dd3fc" : "#e879f9");
  const typeLabel = isHybrid ? "Europe" : isCup ? L("competitions.cup", "Coupe") : L("competitions.league", "Championnat");
  return <article className={`group relative overflow-hidden rounded-3xl border bg-[#07182b] transition duration-300 hover:-translate-y-1 sm:min-h-[340px] ${featured ? "lg:col-span-2 lg:min-h-[310px]" : ""}`} style={{ borderColor: `${borderColor}8c`, boxShadow: `0 26px 70px -48px ${borderColor}` }}>
    <div className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.025]" style={{ backgroundImage: `url(${banner})` }} />
    <div className="absolute inset-0 bg-[#061426]" style={{ opacity: safeOverlay(competition.portal_overlay, 0.35) }} />
    <div className="absolute inset-0 bg-gradient-to-t from-[#061426] via-[#07182b]/85 to-black/15" />
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-90" style={{ background: `linear-gradient(90deg, transparent, ${borderColor}, transparent)` }} />
    <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full opacity-[0.15] blur-3xl" style={{ backgroundColor: borderColor }} />
    <Link href={path} className={`relative flex flex-col p-4 sm:min-h-[270px] sm:p-6 ${featured ? "lg:min-h-[240px] lg:px-8" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] backdrop-blur-sm" style={{ borderColor: `${borderColor}80`, color: borderColor }}>{isCup || isHybrid ? <Trophy className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}{typeLabel}</span>
        {!isEuropean && <span className="text-sm text-white/75">{competition.ext?.country_flag ? <img src={competition.ext.country_flag} className="h-4 w-6 rounded-sm object-cover" alt="" /> : FLAG[country] || "🇧🇪"}</span>}
      </div>
      <div className={`mt-7 flex items-center gap-3 sm:mt-auto sm:items-end sm:gap-4 ${featured ? "sm:pt-12 lg:gap-6 lg:pt-8" : "sm:pt-16"}`}>
        {competition.logo_url && <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 p-2 backdrop-blur-sm sm:h-20 sm:w-20 ${featured ? "lg:h-24 lg:w-24" : ""}`}><img src={competition.logo_url} className="h-full w-full object-contain drop-shadow-xl" alt="" /></div>}
        <div className="min-w-0 flex-1"><h2 className={`text-2xl font-black leading-none text-white ${featured ? "sm:text-4xl lg:text-5xl" : "sm:text-4xl"}`}>{title}</h2><p className={`mt-2 line-clamp-2 text-xs leading-5 text-white/70 sm:text-sm ${featured ? "max-w-2xl sm:text-base" : ""}`}>{subtitle}</p></div>
        {featured && <ArrowRight className="mb-2 hidden h-7 w-7 shrink-0 text-white/55 transition group-hover:translate-x-1 group-hover:text-white lg:block" />}
      </div>
    </Link>
    <div className="relative grid grid-cols-2 border-t border-white/10 bg-[#020b15]/60 p-1.5 backdrop-blur-md sm:grid-cols-4 sm:p-2">
      <Link href={path} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[10px] font-bold text-white/90 transition hover:bg-white/[0.08] hover:text-white sm:py-2.5 sm:text-[11px]"><ArrowRight className="h-3.5 w-3.5" />{L("comp.tab.overview", "Vue d'ensemble")}</Link>
      <Link href={`${path}?tab=matchs`} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[10px] font-bold text-white/90 transition hover:bg-white/[0.08] hover:text-white sm:py-2.5 sm:text-[11px]"><CalendarDays className="h-3.5 w-3.5" />{L("nav.matchs", "Matchs")}</Link>
      <Link href={`${path}?tab=classement`} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[10px] font-bold text-white/90 transition hover:bg-white/[0.08] hover:text-white sm:py-2.5 sm:text-[11px]"><ListOrdered className="h-3.5 w-3.5" />{isHybrid ? "Classement / tableau" : isCup ? L("cup.rounds", "Tours") : L("nav.classement", "Classement")}</Link>
      <Link href={`${path}?tab=clubs`} className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[10px] font-bold text-white/90 transition hover:bg-white/[0.08] hover:text-white sm:py-2.5 sm:text-[11px]"><UsersRound className="h-3.5 w-3.5" />{isInternational ? "Sélections" : L("nav.clubs", "Clubs")}</Link>
    </div>
  </article>;
}

function CompetitionsContent() {
  const L = useLabels();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hub = useCompetitionHub();
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestedPortal = ["national", "europe", "international"].includes(searchParams.get("univers")) ? searchParams.get("univers") : "national";
  const [portal, setPortal] = useState(requestedPortal);
  const rankings = useRankings();

  useEffect(() => { setPortal(requestedPortal); }, [requestedPortal]);
  const choosePortal = (next) => {
    setPortal(next);
    router.replace(`/competitions?univers=${next}`, { scroll: false });
  };

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

  const sections = [{
    key: portal,
    title: portal === "national" ? "Compétitions belges" : portal === "europe" ? "Coupes d’Europe" : "Compétitions de sélections",
    subtitle: portal === "national" ? "Championnats et coupe nationale." : portal === "europe" ? "Toutes les équipes engagées, avec les clubs belges mis en évidence." : "Qualifications, Nations League, Euro, Coupe du monde et amicaux.",
    rows: comps.filter((competition) => competitionScope(competition) === portal),
  }];

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

      <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-line/10 bg-surface/60 p-1.5">
        <button type="button" onClick={() => choosePortal("national")} className={`flex items-center justify-center gap-1 rounded-xl px-1 py-3 text-xs font-black transition sm:gap-2 sm:px-3 sm:text-sm ${portal === "national" ? "bg-white text-slate-950 shadow-lg" : "text-muted hover:bg-white/[0.04] hover:text-white"}`}><Flag className="h-4 w-4" />Belgique</button>
        <button type="button" onClick={() => choosePortal("europe")} className={`flex items-center justify-center gap-1 rounded-xl px-1 py-3 text-xs font-black transition sm:gap-2 sm:px-3 sm:text-sm ${portal === "europe" ? "bg-white text-slate-950 shadow-lg" : "text-muted hover:bg-white/[0.04] hover:text-white"}`}><Trophy className="h-4 w-4" />Europe</button>
        <button type="button" onClick={() => choosePortal("international")} className={`flex items-center justify-center gap-1 rounded-xl px-1 py-3 text-xs font-black transition sm:gap-2 sm:px-3 sm:text-sm ${portal === "international" ? "bg-white text-slate-950 shadow-lg" : "text-muted hover:bg-white/[0.04] hover:text-white"}`}><Globe2 className="h-4 w-4" />International</button>
      </div>

      {portal === "national" && (rankings.uefa.rank !== "" || rankings.uefa.points !== "") && (
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

      <div className="space-y-8">
        {sections.map((section) => section.rows.length > 0 && <section key={section.key}>
          {portal !== "national" && <div className="mb-3"><h2 className="text-lg font-black">{section.title}</h2><p className="mt-1 text-xs text-muted">{section.subtitle}</p></div>}
          <div className="grid gap-4 lg:grid-cols-2">{section.rows.map((competition, index) => <CompetitionCard key={competition.id} competition={competition} index={index} L={L} />)}</div>
        </section>)}
        {!loading && !error && sections.every((section) => section.rows.length === 0) && <div className="rounded-3xl border border-dashed border-line/20 bg-surface/50 p-10 text-center"><Globe2 className="mx-auto h-8 w-8 text-muted" /><h2 className="mt-3 text-lg font-black">Aucune compétition dans cette catégorie</h2><p className="mt-1 text-sm text-muted">Crée-la dans l’administration puis choisis sa portée dans le champ « Portail ».</p></div>}
      </div>
    </div>
  );
}

export default function CompetitionsPage() {
  return <Suspense fallback={<div className="h-80 animate-pulse rounded-3xl bg-surface" />}><CompetitionsContent /></Suspense>;
}
