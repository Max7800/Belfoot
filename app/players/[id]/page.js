"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, MapPin, Shield, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLabels } from "@/lib/labels";
import DiscussButton from "@/components/forum/DiscussButton";

const POSITION_LABELS = { Goalkeeper: "Gardien", GK: "Gardien", Defender: "Défenseur", DEF: "Défenseur", Midfielder: "Milieu", MID: "Milieu", Attacker: "Attaquant", FWD: "Attaquant" };
const FINISHED = new Set(["finished"]);
const year = (value) => Number((String(value || "").match(/\d{4}/) || [0])[0]);
const matchTime = (match) => match?.kickoff ? new Date(match.kickoff).getTime() : 0;

function total(rows, key) {
  return rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
}

function ClubMark({ club, size = "h-7 w-7" }) {
  return club?.logo_url
    ? <img src={club.logo_url} className={`${size} shrink-0 object-contain`} alt="" />
    : <span className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-white/[0.06]`}><Shield className="h-4 w-4 text-muted" /></span>;
}

function MatchCard({ match, clubs, playerClubId }) {
  const home = clubs[match.home_club_id];
  const away = clubs[match.away_club_id];
  const opponent = match.home_club_id === playerClubId ? away : home;
  const playerIsHome = match.home_club_id === playerClubId;
  const played = FINISHED.has(match.status);
  const date = match.kickoff ? new Date(match.kickoff) : null;
  return (
    <Link href={`/matchs/${match.id}`} className="group rounded-2xl border border-line/10 bg-gradient-to-br from-surface to-bg/55 p-4 transition hover:-translate-y-0.5 hover:border-accent/40">
      <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span>{date ? date.toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short" }) : "Date à confirmer"}</span>
        <span>{date ? date.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <ClubMark club={opponent} size="h-10 w-10" />
        <div className="min-w-0 flex-1"><div className="text-[10px] text-muted">{playerIsHome ? "À domicile" : "À l’extérieur"}</div><div className="truncate text-sm font-black group-hover:text-accent">{opponent?.name || "Adversaire à confirmer"}</div></div>
        <div className="shrink-0 rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-sm font-black tabular-nums">{played ? `${match.home_score ?? "–"} : ${match.away_score ?? "–"}` : "VS"}</div>
      </div>
    </Link>
  );
}

export default function PlayerPage() {
  const { id } = useParams();
  const L = useLabels();
  const [state, setState] = useState({ player: undefined, club: null, currentClubId: null, memberships: [], stats: [], performances: [], matches: [], competitions: {}, clubs: {}, error: "" });

  useEffect(() => { let alive = true; (async () => {
    const { data: player, error: playerError } = await supabase.from("players").select("*").eq("id", id).maybeSingle();
    if (playerError) throw playerError;
    if (!player) { if (alive) setState((current) => ({ ...current, player: null })); return; }

    const membershipResult = await supabase.from("player_team_seasons").select("*").eq("player_id", id).order("season_start_year", { ascending: false, nullsFirst: false });
    const memberships = membershipResult.error ? [] : (membershipResult.data || []);
    const primaryMembership = memberships.find((row) => row.active && row.is_primary)
      || memberships.find((row) => row.active)
      || memberships[0];
    const currentClubId = primaryMembership?.club_id || player.club_id || null;

    const [clubResult, statsResult, performancesResult, clubMatchesResult] = await Promise.all([
      currentClubId ? supabase.from("clubs").select("id,name,logo_url,city,team_type,parent_club_id").eq("id", currentClubId).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("player_season_stats").select("*").eq("player_id", id).order("season", { ascending: false }),
      supabase.from("match_player_stats").select("*").eq("player_id", id).limit(60),
      currentClubId ? supabase.from("matches").select("id,competition_id,home_club_id,away_club_id,home_score,away_score,kickoff,status").or(`home_club_id.eq.${currentClubId},away_club_id.eq.${currentClubId}`).order("kickoff", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    ]);
    if (statsResult.error) throw statsResult.error;
    if (performancesResult.error) throw performancesResult.error;
    if (clubMatchesResult.error) throw clubMatchesResult.error;

    const matchesById = new Map((clubMatchesResult.data || []).map((match) => [match.id, match]));
    const missingMatchIds = [...new Set((performancesResult.data || []).map((row) => row.match_id).filter((matchId) => matchId && !matchesById.has(matchId)))];
    if (missingMatchIds.length) {
      const { data: oldMatches, error } = await supabase.from("matches").select("id,competition_id,home_club_id,away_club_id,home_score,away_score,kickoff,status").in("id", missingMatchIds);
      if (error) throw error;
      for (const match of oldMatches || []) matchesById.set(match.id, match);
    }
    const matches = [...matchesById.values()];
    const clubIds = [...new Set([...matches.flatMap((match) => [match.home_club_id, match.away_club_id]), ...memberships.map((row) => row.club_id), ...(statsResult.data || []).map((row) => row.club_id)].filter(Boolean))];
    const competitionIds = [...new Set([...(statsResult.data || []).map((row) => row.competition_id), ...matches.map((row) => row.competition_id)].filter(Boolean))];
    const [clubsResult, competitionsResult] = await Promise.all([
      clubIds.length ? supabase.from("clubs").select("id,name,logo_url").in("id", clubIds) : Promise.resolve({ data: [] }),
      competitionIds.length ? supabase.from("competitions").select("id,name,logo_url").in("id", competitionIds) : Promise.resolve({ data: [] }),
    ]);
    if (!alive) return;
    setState({
      player,
      club: clubResult.data || null,
      currentClubId,
      memberships,
      stats: statsResult.data || [],
      performances: performancesResult.data || [],
      matches,
      clubs: Object.fromEntries((clubsResult.data || []).map((row) => [row.id, row])),
      competitions: Object.fromEntries((competitionsResult.data || []).map((row) => [row.id, row])),
      error: "",
    });
  })().catch((error) => alive && setState((current) => ({ ...current, player: null, error: error.message || String(error) }))); return () => { alive = false; }; }, [id]);

  const view = useMemo(() => {
    const latestSeason = Math.max(0, ...state.stats.map((row) => year(row.season)));
    const latestStats = latestSeason ? state.stats.filter((row) => year(row.season) === latestSeason) : state.stats;
    const ratings = latestStats.map((row) => Number(row.rating)).filter((value) => value > 0);
    const totals = {
      appearances: total(latestStats, "appearances"), minutes: total(latestStats, "minutes"), goals: total(latestStats, "goals"), assists: total(latestStats, "assists"),
      rating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
    };
    const now = Date.now();
    const upcoming = state.matches.filter((match) => match.kickoff && !FINISHED.has(match.status) && matchTime(match) >= now).sort((a, b) => matchTime(a) - matchTime(b)).slice(0, 3);
    const matchMap = Object.fromEntries(state.matches.map((match) => [match.id, match]));
    const performanceRows = state.performances.map((performance) => ({ performance, match: matchMap[performance.match_id] })).filter((row) => row.match).sort((a, b) => matchTime(b.match) - matchTime(a.match)).slice(0, 8);
    return { latestSeason, totals, upcoming, performanceRows };
  }, [state]);

  if (state.player === undefined) return <div className="space-y-4"><div className="h-7 w-40 animate-pulse rounded bg-surface" /><div className="h-52 animate-pulse rounded-3xl bg-surface" /></div>;
  if (state.player === null) return <div><Link href="/belges-a-l-etranger" className="mb-5 inline-flex items-center gap-2 text-sm text-muted hover:text-content"><ArrowLeft className="h-4 w-4" />Retour aux Belges</Link><p className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300">{state.error || "Joueur introuvable."}</p></div>;
  const p = state.player;
  const position = POSITION_LABELS[p.position] || p.position;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/belges-a-l-etranger" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-content"><ArrowLeft className="h-4 w-4" />Retour aux Belges à l’étranger</Link>

      <section className="relative overflow-hidden rounded-3xl border border-line/10 bg-gradient-to-br from-surface via-surface2/70 to-bg p-5 shadow-[0_24px_70px_-48px_rgba(0,0,0,.95)] sm:p-7">
        <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          {p.photo_url ? <img src={p.photo_url} className="h-28 w-28 rounded-3xl object-cover ring-1 ring-white/10" alt="" /> : <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-white/[0.06] text-3xl font-black">{p.name?.slice(0, 2).toUpperCase()}</div>}
          <div className="min-w-0 flex-1"><div className="text-[11px] font-black uppercase tracking-[0.2em] text-accent">{position || "Joueur belge"}</div><h1 className="mt-1 text-3xl font-black sm:text-5xl">{p.name}</h1><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted"><span>🇧🇪 {p.nationality || "Belgique"}</span>{p.age && <span>{p.age} ans</span>}{p.country && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.country}</span>}</div>{state.club && <Link href={`/clubs/${state.club.id}`} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-line/10 bg-black/15 px-3 py-2 text-sm font-bold transition hover:border-accent/40"><ClubMark club={state.club} />{state.club.name}</Link>}</div>
          <div className="grid grid-cols-2 gap-2 sm:w-64"><div className="rounded-2xl border border-line/10 bg-black/15 p-3"><b className="block text-2xl">{view.totals.goals}</b><span className="text-[10px] uppercase tracking-wider text-muted">Buts</span></div><div className="rounded-2xl border border-line/10 bg-black/15 p-3"><b className="block text-2xl">{view.totals.assists}</b><span className="text-[10px] uppercase tracking-wider text-muted">Passes</span></div><div className="rounded-2xl border border-line/10 bg-black/15 p-3"><b className="block text-2xl">{view.totals.appearances}</b><span className="text-[10px] uppercase tracking-wider text-muted">Matchs</span></div><div className="rounded-2xl border border-line/10 bg-black/15 p-3"><b className="block text-2xl">{view.totals.rating?.toFixed(1) || "—"}</b><span className="text-[10px] uppercase tracking-wider text-muted">Note</span></div></div>
        </div>
      </section>

      <div className="mt-4"><DiscussButton refType="player" refId={p.id} title={`Discussion : ${p.name}`} label="Discuter de ce joueur" categorySlug="belges-etranger" /></div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_1.95fr]">
        <div className="space-y-8">
          <section><div className="mb-3 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-accent" /><h2 className="text-lg font-black">Prochains matchs</h2></div>{view.upcoming.length ? <div className="space-y-3">{view.upcoming.map((match) => <MatchCard key={match.id} match={match} clubs={state.clubs} playerClubId={state.currentClubId} />)}</div> : <div className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-5 text-sm leading-6 text-muted">Aucun prochain match importé pour son club.</div>}</section>
          <section><div className="mb-3 flex items-center gap-2"><Shield className="h-5 w-5 text-accent" /><h2 className="text-lg font-black">Parcours en club</h2></div>{state.memberships.length ? <div className="space-y-2">{state.memberships.map((membership) => { const club = state.clubs[membership.club_id] || (state.club?.id === membership.club_id ? state.club : null); return <Link key={membership.id} href={`/clubs/${membership.club_id}`} className="flex items-center gap-3 rounded-2xl border border-line/10 bg-surface/60 p-3 transition hover:border-accent/40"><ClubMark club={club} size="h-9 w-9" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{club?.name || "Club à préciser"}</div><div className="text-[11px] text-muted">{membership.season}{membership.squad_role && membership.squad_role !== "first_team" ? ` · ${membership.squad_role.toUpperCase()}` : ""}{membership.membership_type === "loan" ? " · Prêt" : ""}</div></div>{membership.is_primary && <span className="rounded-full bg-accent/10 px-2 py-1 text-[9px] font-bold uppercase text-accent">principal</span>}</Link>; })}</div> : <div className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-5 text-sm text-muted">L’historique des clubs sera complété par les imports de carrière ou manuellement dans l’administration.</div>}</section>
          <section><div className="mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent" /><h2 className="text-lg font-black">Saison {view.latestSeason || "en cours"}</h2></div><div className="rounded-2xl border border-line/10 bg-surface/60 p-4"><div className="grid grid-cols-2 gap-4 text-center"><div><b className="block text-2xl">{view.totals.minutes}</b><span className="text-[10px] uppercase tracking-wider text-muted">Minutes</span></div><div><b className="block text-2xl">{view.totals.appearances ? Math.round(view.totals.minutes / view.totals.appearances) : 0}</b><span className="text-[10px] uppercase tracking-wider text-muted">Min./match</span></div></div>{p.synced_at && <div className="mt-4 border-t border-line/10 pt-3 text-[10px] text-muted">Données actualisées le {new Date(p.synced_at).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" })}</div>}</div></section>
        </div>

        <div className="space-y-8">
          <section><div className="mb-3 flex items-center gap-2"><Clock3 className="h-5 w-5 text-accent" /><h2 className="text-lg font-black">{L("player.recent.performances", "Dernières performances")}</h2></div>{view.performanceRows.length ? <div className="space-y-2">{view.performanceRows.map(({ performance, match }) => {
            const home = state.clubs[match.home_club_id]; const away = state.clubs[match.away_club_id];
            return <Link key={performance.id} href={`/matchs/${performance.match_id}`} className="block rounded-2xl border border-line/10 bg-surface/65 p-3 transition hover:border-accent/40"><div className="flex items-center gap-2"><ClubMark club={home} /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{home?.name || "—"}</span><b className="shrink-0 rounded-lg bg-bg/70 px-2.5 py-1.5 text-sm tabular-nums">{match.home_score ?? "–"} : {match.away_score ?? "–"}</b><span className="min-w-0 flex-1 truncate text-right text-xs font-semibold">{away?.name || "—"}</span><ClubMark club={away} /></div><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/10 pt-3 text-[11px] text-muted"><span>{new Date(match.kickoff).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}</span><span><b className="text-content">{performance.minutes ?? 0}</b> min</span>{performance.starter && <span>Titulaire</span>}{performance.goals > 0 && <b className="text-content">⚽ {performance.goals}</b>}{performance.assists > 0 && <b className="text-sky-300">A {performance.assists}</b>}{performance.rating != null && <b className="ml-auto rounded-lg bg-accent/15 px-2 py-1 text-accent">{Number(performance.rating).toFixed(1)}</b>}</div></Link>;
          })}</div> : <div className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-5 text-sm leading-6 text-muted">Les statistiques de saison sont disponibles. Les performances match par match apparaîtront après une synchronisation ciblée « Compositions & performances ».</div>}</section>

          <section><h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Statistiques par compétition</h2>{state.stats.length === 0 ? <p className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-5 text-sm text-muted">Pas encore de statistiques de saison.</p> : <div className="overflow-x-auto rounded-2xl border border-line/10"><table className="w-full min-w-[760px] text-sm"><thead className="bg-surface2 text-muted"><tr><th className="p-3 text-left">Compétition</th><th className="p-3 text-left">Club</th><th className="p-3 text-left">Saison</th><th>Matchs</th><th>Titu.</th><th>Min.</th><th>Buts</th><th>Passes</th><th>🟨</th><th>🟥</th></tr></thead><tbody>{state.stats.map((stat) => <tr key={stat.id} className="border-t border-line/10 text-center"><td className="p-3 text-left font-semibold">{state.competitions[stat.competition_id]?.name || "Non attribuée"}</td><td className="p-3 text-left">{state.clubs[stat.club_id]?.name || "—"}</td><td className="p-3 text-left">{stat.season}</td><td>{stat.appearances ?? 0}</td><td>{stat.lineups ?? 0}</td><td>{stat.minutes ?? 0}</td><td className="font-bold">{stat.goals ?? 0}</td><td>{stat.assists ?? 0}</td><td>{stat.yellow ?? 0}</td><td>{stat.red ?? 0}</td></tr>)}</tbody></table></div>}</section>
        </div>
      </div>
    </div>
  );
}
