"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, MapPin, Pencil, RefreshCw, Save, Shield, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLabels } from "@/lib/labels";
import DiscussButton from "@/components/forum/DiscussButton";
import { playerAge } from "@/lib/playerAge";
import { preferAssignedPlayerStats } from "@/lib/playerStats";
import { NATIONAL_TEAM_CATALOG, isNationalSelectionClub, nationalityBadges, ratingTone } from "@/lib/nationalities";
import { useAuth } from "@/lib/auth";

const POSITION_LABELS = { Goalkeeper: "Gardien", GK: "Gardien", Defender: "Défenseur", DEF: "Défenseur", Midfielder: "Milieu", MID: "Milieu", Attacker: "Attaquant", FWD: "Attaquant" };
const FINISHED = new Set(["finished"]);
const year = (value) => Number((String(value || "").match(/\d{4}/) || [0])[0]);
const matchTime = (match) => match?.kickoff ? new Date(match.kickoff).getTime() : 0;
const matchSeasonYear = (match) => {
  const date = match?.kickoff ? new Date(match.kickoff) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
};

function total(rows, key) {
  return rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
}

function ClubMark({ club, size = "h-7 w-7" }) {
  return club?.logo_url
    ? <img src={club.logo_url} className={`${size} shrink-0 object-contain`} alt="" />
    : <span className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-white/[0.06]`}><Shield className="h-4 w-4 text-muted" /></span>;
}

function MatchCard({ match, clubs, competitions, playerTeamIds = [] }) {
  const home = clubs[match.home_club_id];
  const away = clubs[match.away_club_id];
  const playerIsHome = playerTeamIds.includes(match.home_club_id);
  const played = FINISHED.has(match.status);
  const date = match.kickoff ? new Date(match.kickoff) : null;
  const competition = competitions[match.competition_id];
  return (
    <Link href={`/matchs/${match.id}`} className="group block w-full overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-br from-surface via-surface/80 to-bg/55 transition hover:-translate-y-0.5 hover:border-accent/40">
      <div className="flex items-center justify-between gap-3 border-b border-line/10 bg-white/[0.025] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span>{date ? date.toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short" }) : "Date à confirmer"}</span>
        <span className="max-w-[45%] truncate text-right">{competition?.name || "Match"}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-3">
        <div className={`min-w-0 text-center ${playerIsHome ? "text-content" : "text-muted"}`}><ClubMark club={home} size="mx-auto h-10 w-10" /><div className="mt-1 truncate text-[11px] font-black">{home?.name || "À confirmer"}</div></div>
        <div className="text-center"><div className="rounded-xl border border-line/10 bg-bg/70 px-2.5 py-1.5 text-sm font-black tabular-nums">{played ? `${match.home_score ?? "–"} : ${match.away_score ?? "–"}` : (date ? date.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }) : "VS")}</div><div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-muted">{playerIsHome ? "Domicile" : "Extérieur"}</div></div>
        <div className={`min-w-0 text-center ${!playerIsHome ? "text-content" : "text-muted"}`}><ClubMark club={away} size="mx-auto h-10 w-10" /><div className="mt-1 truncate text-[11px] font-black">{away?.name || "À confirmer"}</div></div>
      </div>
    </Link>
  );
}

export default function PlayerPage() {
  const { id } = useParams();
  const L = useLabels();
  const { isAdmin } = useAuth();
  const [state, setState] = useState({ player: undefined, club: null, nationalTeam: null, currentClubId: null, memberships: [], stats: [], performances: [], matches: [], competitions: {}, clubs: {}, error: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState({ primaryNationality: "", secondNationality: "", nationalTeamId: "" });
  const [nationalTeams, setNationalTeams] = useState([]);
  const [adminStatus, setAdminStatus] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);

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
    const relevantTeamIds = [...new Set([currentClubId, player.national_team_id].filter(Boolean))];

    const [clubResult, nationalTeamResult, statsResult, performancesResult, clubMatchesResult] = await Promise.all([
      currentClubId ? supabase.from("clubs").select("id,name,logo_url,city,team_type,parent_club_id,national_category,ext").eq("id", currentClubId).maybeSingle() : Promise.resolve({ data: null }),
      player.national_team_id ? supabase.from("clubs").select("id,name,short_name,logo_url,team_type,national_category").eq("id", player.national_team_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("player_season_stats").select("*").eq("player_id", id).order("season", { ascending: false }),
      supabase.from("match_player_stats").select("*").eq("player_id", id).limit(60),
      relevantTeamIds.length ? supabase.from("matches").select("id,competition_id,home_club_id,away_club_id,home_score,away_score,kickoff,status").or(`home_club_id.in.(${relevantTeamIds.join(",")}),away_club_id.in.(${relevantTeamIds.join(",")})`).order("kickoff", { ascending: false }).limit(120) : Promise.resolve({ data: [] }),
    ]);
    if (statsResult.error) throw statsResult.error;
    if (performancesResult.error) throw performancesResult.error;
    if (clubMatchesResult.error) throw clubMatchesResult.error;

    const statsRows = preferAssignedPlayerStats(statsResult.data || []);
    const matchesById = new Map((clubMatchesResult.data || []).map((match) => [match.id, match]));
    const missingMatchIds = [...new Set((performancesResult.data || []).map((row) => row.match_id).filter((matchId) => matchId && !matchesById.has(matchId)))];
    if (missingMatchIds.length) {
      const { data: oldMatches, error } = await supabase.from("matches").select("id,competition_id,home_club_id,away_club_id,home_score,away_score,kickoff,status").in("id", missingMatchIds);
      if (error) throw error;
      for (const match of oldMatches || []) matchesById.set(match.id, match);
    }
    const matches = [...matchesById.values()];
    const clubIds = [...new Set([...matches.flatMap((match) => [match.home_club_id, match.away_club_id]), ...memberships.map((row) => row.club_id), ...statsRows.map((row) => row.club_id), player.national_team_id].filter(Boolean))];
    const competitionIds = [...new Set([...statsRows.map((row) => row.competition_id), ...matches.map((row) => row.competition_id)].filter(Boolean))];
    const [clubsResult, competitionsResult] = await Promise.all([
      clubIds.length ? supabase.from("clubs").select("id,name,logo_url,team_type,national_category,ext").in("id", clubIds) : Promise.resolve({ data: [] }),
      competitionIds.length ? supabase.from("competitions").select("id,name,logo_url,provider").in("id", competitionIds) : Promise.resolve({ data: [] }),
    ]);
    if (!alive) return;
    setState({
      player,
      club: clubResult.data || null,
      nationalTeam: nationalTeamResult.data || null,
      currentClubId,
      memberships,
      stats: statsRows,
      performances: performancesResult.data || [],
      matches,
      clubs: Object.fromEntries((clubsResult.data || []).map((row) => [row.id, row])),
      competitions: Object.fromEntries((competitionsResult.data || []).map((row) => [row.id, row])),
      error: "",
    });
  })().catch((error) => alive && setState((current) => ({ ...current, player: null, error: error.message || String(error) }))); return () => { alive = false; }; }, [id, refreshKey]);

  const view = useMemo(() => {
    const latestSeason = Math.max(0, ...state.stats.map((row) => year(row.season)), ...state.memberships.map((row) => Number(row.season_start_year) || year(row.season)));
    const latestStats = latestSeason ? state.stats.filter((row) => year(row.season) === latestSeason) : state.stats;
    const clubLatestStats = latestStats.filter((row) => !isNationalSelectionClub(state.clubs[row.club_id], state.player?.nationality));
    const matchMap = Object.fromEntries(state.matches.map((match) => [match.id, match]));
    const primaryStat = [...clubLatestStats]
      .filter((row) => row.competition_id)
      .sort((a, b) => (Number(b.appearances) || 0) - (Number(a.appearances) || 0))[0];
    const performanceCompetitionCounts = state.performances.reduce((counts, performance) => {
      const competitionId = matchMap[performance.match_id]?.competition_id;
      if (competitionId) counts[competitionId] = (counts[competitionId] || 0) + 1;
      return counts;
    }, {});
    const primaryCompetitionId = primaryStat?.competition_id
      || Object.entries(performanceCompetitionCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
      || null;
    const seasonPerformances = state.performances.filter((performance) => {
      const match = matchMap[performance.match_id];
      return match
        && (!latestSeason || matchSeasonYear(match) === latestSeason)
        && (!primaryCompetitionId || String(match.competition_id) === String(primaryCompetitionId));
    });
    const performanceRatings = seasonPerformances.map((row) => Number(row.rating)).filter((value) => value > 0);
    const ratedStats = clubLatestStats
      .filter((row) => !primaryCompetitionId || String(row.competition_id) === String(primaryCompetitionId))
      .map((row) => ({ rating: Number(row.rating), weight: Math.max(1, Number(row.appearances) || 0) }))
      .filter((row) => row.rating > 0);
    const fallbackRatingWeight = ratedStats.reduce((sum, row) => sum + row.weight, 0);
    const fallbackRating = fallbackRatingWeight
      ? ratedStats.reduce((sum, row) => sum + row.rating * row.weight, 0) / fallbackRatingWeight
      : null;
    const totals = {
      appearances: total(clubLatestStats, "appearances"), minutes: total(clubLatestStats, "minutes"), goals: total(clubLatestStats, "goals"), assists: total(clubLatestStats, "assists"),
      rating: performanceRatings.length ? performanceRatings.reduce((sum, value) => sum + value, 0) / performanceRatings.length : fallbackRating,
    };
    const now = Date.now();
    const upcoming = state.matches.filter((match) => match.kickoff && !FINISHED.has(match.status) && matchTime(match) >= now).sort((a, b) => matchTime(a) - matchTime(b)).slice(0, 3);
    const performanceRows = state.performances.map((performance) => ({ performance, match: matchMap[performance.match_id] })).filter((row) => row.match).sort((a, b) => matchTime(b.match) - matchTime(a.match)).slice(0, 8);
    const clubMemberships = state.memberships.filter((membership) => !isNationalSelectionClub(state.clubs[membership.club_id], state.player?.nationality));
    const international = state.stats.reduce((summary, row) => {
      const club = state.clubs[row.club_id];
      if (!isNationalSelectionClub(club, state.player?.nationality)) return summary;
      const marker = `${club?.national_category || ""} ${club?.name || ""}`.toLowerCase();
      const appearances = Number(row.appearances) || 0;
      if (/\bu[ -]?21\b/.test(marker)) summary.u21 += appearances;
      else if (/\bu[ -]?(?:17|18|19|20|22|23)\b|youth|jeune/.test(marker)) summary.youth += appearances;
      else summary.senior += appearances;
      return summary;
    }, { senior: 0, u21: 0, youth: 0 });
    return { latestSeason, totals, upcoming, performanceRows, clubMemberships, international, primaryCompetitionId, primarySeason: primaryStat?.season || (latestSeason ? `${latestSeason}-${latestSeason + 1}` : "2026-2027"), ratingCompetition: state.competitions[primaryCompetitionId]?.name || "Compétition principale" };
  }, [state]);

  const openEditor = async () => {
    const values = String(state.player?.nationality || "").split(/[,;/|]/).map((value) => value.trim()).filter(Boolean);
    setEditor({ primaryNationality: values[0] || "", secondNationality: values[1] || "", nationalTeamId: state.player?.national_team_id || "" });
    setAdminStatus(""); setEditing(true);
    if (!nationalTeams.length) {
      const { data } = await supabase.from("clubs").select("id,name,logo_url,national_category").eq("team_type", "national").order("name");
      const stored = data || [];
      const storedNames = new Set(stored.map((team) => String(team.name || "").toLocaleLowerCase("fr")));
      setNationalTeams([
        ...stored.map((team) => ({ ...team, value: team.id, stored: true })),
        ...NATIONAL_TEAM_CATALOG.filter((team) => !storedNames.has(team.name.toLocaleLowerCase("fr"))).map((team) => ({ ...team, id: `catalog:${team.code}`, value: `catalog:${team.code}`, national_category: "senior", stored: false })),
      ].sort((a, b) => a.name.localeCompare(b.name, "fr")));
    }
  };

  const saveEditorialIdentity = async () => {
    setAdminBusy(true); setAdminStatus("");
    const nationality = [editor.primaryNationality.trim(), editor.secondNationality.trim()].filter(Boolean).join(", ");
    const ext = { ...(state.player?.ext || {}), editorial_nationality: true };
    let nationalTeamId = editor.nationalTeamId || null;
    if (nationalTeamId?.startsWith("catalog:")) {
      const code = nationalTeamId.slice("catalog:".length);
      const catalogTeam = NATIONAL_TEAM_CATALOG.find((team) => team.code === code);
      if (!catalogTeam) { setAdminBusy(false); setAdminStatus("Erreur : sélection inconnue."); return; }
      const { data: existingTeam, error: lookupError } = await supabase.from("clubs").select("id").eq("team_type", "national").ilike("name", catalogTeam.name).limit(1).maybeSingle();
      if (lookupError) { setAdminBusy(false); setAdminStatus(`Erreur : ${lookupError.message}`); return; }
      if (existingTeam?.id) nationalTeamId = existingTeam.id;
      else {
        const { data: createdTeam, error: createError } = await supabase.from("clubs").insert({
          name: catalogTeam.name,
          short_name: catalogTeam.name,
          logo_url: catalogTeam.flagUrl,
          team_type: "national",
          national_category: "senior",
          national_gender: "men",
          source: "manual",
          locked: true,
          ext: { country_code: catalogTeam.code, catalog_only: true },
        }).select("id").single();
        if (createError) { setAdminBusy(false); setAdminStatus(`Erreur : ${createError.message}`); return; }
        nationalTeamId = createdTeam.id;
      }
    }
    const { error } = await supabase.from("players").update({
      nationality: nationality || null,
      national_team_id: nationalTeamId,
      national_team_locked: true,
      ext,
    }).eq("id", id);
    setAdminBusy(false);
    if (error) { setAdminStatus(`Erreur : ${error.message}`); return; }
    setEditing(false); setAdminStatus("Identité sportive enregistrée et protégée des synchronisations.");
    setRefreshKey((value) => value + 1);
  };

  const refreshCareer = async () => {
    if (!view.primaryCompetitionId) { setAdminStatus("Impossible de déterminer la compétition de référence de ce joueur."); return; }
    setAdminBusy(true); setAdminStatus("Calcul du coût de la synchronisation…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = { key: "football.player-careers", competitionId: view.primaryCompetitionId, playerId: id, season: view.primarySeason, includeCareerStats: true, batchSize: 1, requestLimit: 2 };
      const preflightResponse = await fetch("/api/admin/job-preflight", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token || ""}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const preflight = await preflightResponse.json().catch(() => ({}));
      if (!preflightResponse.ok) throw new Error(preflight.error || "Préflight impossible");
      if (!preflight.ok) throw new Error((preflight.blockers || []).join(" · ") || "Synchronisation bloquée");
      if (!window.confirm(`Rafraîchir la carrière et toutes les compétitions jouées par ${state.player.name} en ${view.primarySeason} ?\n\nCoût maximal estimé : ${preflight.total?.max ?? 2} appels API.`)) { setAdminBusy(false); setAdminStatus(""); return; }
      setAdminStatus("Synchronisation ciblée en cours…");
      const response = await fetch("/api/admin/run-job", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token || ""}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const responseText = await response.text();
      let result; try { result = JSON.parse(responseText); } catch { result = { detail: responseText }; }
      if (!response.ok) throw new Error(result.detail || result.error || "La synchronisation a échoué");
      setAdminStatus(result.detail || "Carrière actualisée.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setAdminStatus(`Erreur : ${error.message}`);
    } finally {
      setAdminBusy(false);
    }
  };

  if (state.player === undefined) return <div className="space-y-4"><div className="h-7 w-40 animate-pulse rounded bg-surface" /><div className="h-52 animate-pulse rounded-3xl bg-surface" /></div>;
  if (state.player === null) return <div><Link href="/belges-a-l-etranger" className="mb-5 inline-flex items-center gap-2 text-sm text-muted hover:text-content"><ArrowLeft className="h-4 w-4" />Retour aux Belges</Link><p className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300">{state.error || "Joueur introuvable."}</p></div>;
  const p = state.player;
  const position = POSITION_LABELS[p.position] || p.position;
  const currentAge = playerAge(p);
  const nationalities = nationalityBadges([p.nationality, ...(Array.isArray(p.ext?.nationalities) ? p.ext.nationalities : [])]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/belges-a-l-etranger" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-content"><ArrowLeft className="h-4 w-4" />Retour aux Belges à l’étranger</Link>

      <section className="relative overflow-hidden rounded-3xl border border-line/10 bg-gradient-to-br from-surface via-surface2/70 to-bg p-5 shadow-[0_24px_70px_-48px_rgba(0,0,0,.95)] sm:p-7">
        <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          {p.photo_url ? <img src={p.photo_url} className="h-28 w-28 rounded-3xl object-cover ring-1 ring-white/10" alt="" /> : <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-white/[0.06] text-3xl font-black">{p.name?.slice(0, 2).toUpperCase()}</div>}
          <div className="min-w-0 flex-1"><div className="text-[11px] font-black uppercase tracking-[0.2em] text-accent">{position || "Joueur belge"}</div><h1 className="mt-1 text-3xl font-black sm:text-5xl">{p.name}</h1><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted"><span className="inline-flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Nationalités</span>{nationalities.length ? nationalities.map((nationality) => <span key={`${nationality.code}-${nationality.label}`} className="inline-flex items-center gap-1 rounded-full border border-line/10 bg-black/15 px-2 py-1">{nationality.flagUrl ? <img src={nationality.flagUrl} alt="" className="h-[14px] w-[19px] rounded-[2px] object-cover" /> : <span className="text-base leading-none">{nationality.flag}</span>}{nationality.label}</span>) : <span>🌍 À préciser</span>}</span>{currentAge && <span>{currentAge} ans</span>}{p.country && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.country}</span>}</div>{state.nationalTeam && <div className="mt-3 flex"><span className="inline-flex items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] px-3 py-2 text-xs"><span className="font-black uppercase tracking-wider text-sky-300">Sélection représentée</span><ClubMark club={state.nationalTeam} size="h-5 w-5" /><b className="text-white">{state.nationalTeam.name}</b></span></div>}{state.club && <Link href={`/clubs/${state.club.id}`} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-line/10 bg-black/15 px-3 py-2 text-sm font-bold transition hover:border-accent/40"><ClubMark club={state.club} />{state.club.name}</Link>}<div className="mt-4 grid max-w-md grid-cols-2 gap-2"><div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.08] px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-wider text-sky-200">Parcours international · A</span><b className="mt-1 block text-xl">{view.international.senior} <span className="text-[10px] font-normal text-muted">sélection{view.international.senior > 1 ? "s" : ""}</span></b></div><div className="rounded-xl border border-line/10 bg-black/15 px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-wider text-slate-300">U21</span><b className="mt-1 block text-xl">{view.international.u21} <span className="text-[10px] font-normal text-muted">sélection{view.international.u21 > 1 ? "s" : ""}</span></b></div></div></div>
          <div className="grid grid-cols-2 gap-2 sm:w-64"><div className="rounded-2xl border border-line/10 bg-black/15 p-3"><b className="block text-2xl">{view.totals.goals}</b><span className="text-[10px] uppercase tracking-wider text-muted">Buts</span></div><div className="rounded-2xl border border-line/10 bg-black/15 p-3"><b className="block text-2xl">{view.totals.assists}</b><span className="text-[10px] uppercase tracking-wider text-muted">Passes</span></div><div className="rounded-2xl border border-line/10 bg-black/15 p-3"><b className="block text-2xl">{view.totals.appearances}</b><span className="text-[10px] uppercase tracking-wider text-muted">Matchs</span></div><div className="rounded-2xl border border-line/10 bg-black/15 p-3"><b className={`inline-flex min-w-12 justify-center rounded-lg px-2 py-1 text-xl ${view.totals.rating != null ? ratingTone(view.totals.rating) : "text-muted"}`}>{view.totals.rating?.toFixed(1) || "—"}</b><span className="mt-1 block truncate text-[9px] uppercase tracking-wider text-muted" title={view.ratingCompetition}>Note · {view.ratingCompetition}</span></div></div>
        </div>
      </section>

      {isAdmin && <section className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-4">
        <div className="flex flex-wrap items-center gap-2"><div className="mr-auto"><div className="text-[10px] font-black uppercase tracking-[.18em] text-amber-200">Outils administrateur</div><p className="mt-1 text-xs text-muted">Corrige l’identité sportive ou actualise uniquement l’histoire de ce joueur.</p></div><button type="button" onClick={openEditor} disabled={adminBusy} className="inline-flex items-center gap-2 rounded-xl border border-line/15 bg-surface px-3 py-2 text-xs font-bold disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />Modifier la fiche</button><button type="button" onClick={refreshCareer} disabled={adminBusy || !view.primaryCompetitionId} className="inline-flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${adminBusy ? "animate-spin" : ""}`} />Carrière + stats</button></div>
        {editing && <div className="mt-4 grid gap-3 border-t border-line/10 pt-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto]"><label className="text-[10px] font-bold uppercase tracking-wider text-muted">Nationalité principale<input value={editor.primaryNationality} onChange={(event) => setEditor((current) => ({ ...current, primaryNationality: event.target.value }))} placeholder="Belgique" className="mt-1 block w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm normal-case tracking-normal text-content" /></label><label className="text-[10px] font-bold uppercase tracking-wider text-muted">Deuxième nationalité<input value={editor.secondNationality} onChange={(event) => setEditor((current) => ({ ...current, secondNationality: event.target.value }))} placeholder="Maroc, RD Congo, Grèce…" className="mt-1 block w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm normal-case tracking-normal text-content" /></label><label className="text-[10px] font-bold uppercase tracking-wider text-muted">Sélection représentée<select value={editor.nationalTeamId} onChange={(event) => setEditor((current) => ({ ...current, nationalTeamId: event.target.value }))} className="mt-1 block w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm normal-case tracking-normal text-content"><option value="">Aucune / à préciser</option>{nationalTeams.map((team) => <option key={team.id} value={team.value || team.id}>{team.flag || "🌍"} {team.name}{team.stored && team.national_category ? ` · ${team.national_category}` : ""}</option>)}</select></label><div className="flex items-end gap-2"><button type="button" onClick={saveEditorialIdentity} disabled={adminBusy || !editor.primaryNationality.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />Enregistrer</button><button type="button" onClick={() => setEditing(false)} disabled={adminBusy} className="inline-flex h-10 items-center rounded-lg border border-line/10 px-3 text-muted"><X className="h-4 w-4" /></button></div></div>}
        {adminStatus && <p className={`mt-3 rounded-lg border px-3 py-2 text-xs ${adminStatus.startsWith("Erreur") ? "border-red-400/25 bg-red-500/10 text-red-200" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"}`}>{adminStatus}</p>}
      </section>}

      <div className="mt-4"><DiscussButton refType="player" refId={p.id} title={`Discussion : ${p.name}`} label="Discuter de ce joueur" categorySlug="belges-etranger" /></div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(300px,.8fr)_minmax(0,1.7fr)]">
        <div className="space-y-5">
          <section><div className="mb-3 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-accent" /><h2 className="text-lg font-black">Prochains matchs</h2></div>{view.upcoming.length ? <div className="space-y-3">{view.upcoming.map((match) => <MatchCard key={match.id} match={match} clubs={state.clubs} competitions={state.competitions} playerTeamIds={[state.currentClubId, p.national_team_id].filter(Boolean)} />)}</div> : <div className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-5 text-sm leading-6 text-muted">Aucun prochain match importé pour son club ou sa sélection.</div>}</section>
          <section><div className="mb-3 flex items-center gap-2"><Shield className="h-5 w-5 text-accent" /><h2 className="text-lg font-black">Parcours en club</h2></div>{view.clubMemberships.length ? <div className="space-y-2">{view.clubMemberships.map((membership) => { const club = state.clubs[membership.club_id] || (state.club?.id === membership.club_id ? state.club : null); return <Link key={membership.id} href={`/clubs/${membership.club_id}`} className="flex items-center gap-3 rounded-2xl border border-line/10 bg-surface/60 p-3 transition hover:border-accent/40"><ClubMark club={club} size="h-9 w-9" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{club?.name || "Club à préciser"}</div><div className="text-[11px] text-muted">{membership.season}{membership.squad_role && membership.squad_role !== "first_team" ? ` · ${membership.squad_role.toUpperCase()}` : ""}{membership.membership_type === "loan" ? " · Prêt" : ""}</div></div>{membership.is_primary && <span className="rounded-full bg-accent/10 px-2 py-1 text-[9px] font-bold uppercase text-accent">principal</span>}</Link>; })}</div> : <div className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-5 text-sm text-muted">L’historique des clubs sera complété par les imports de carrière ou manuellement dans l’administration.</div>}</section>
          <section><div className="mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent" /><h2 className="text-lg font-black">Saison {view.latestSeason || "en cours"}</h2></div><div className="rounded-2xl border border-line/10 bg-surface/60 p-4"><div className="grid grid-cols-2 gap-4 text-center"><div><b className="block text-2xl">{view.totals.minutes}</b><span className="text-[10px] uppercase tracking-wider text-muted">Minutes</span></div><div><b className="block text-2xl">{view.totals.appearances ? Math.round(view.totals.minutes / view.totals.appearances) : 0}</b><span className="text-[10px] uppercase tracking-wider text-muted">Min./match</span></div></div>{p.synced_at && <div className="mt-4 border-t border-line/10 pt-3 text-[10px] text-muted">Données actualisées le {new Date(p.synced_at).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" })}</div>}</div></section>
        </div>

        <div className="space-y-8">
          <section><div className="mb-3 flex items-center gap-2"><Clock3 className="h-5 w-5 text-accent" /><h2 className="text-lg font-black">{L("player.recent.performances", "Dernières performances")}</h2></div>{view.performanceRows.length ? <div className="space-y-2">{view.performanceRows.map(({ performance, match }) => {
            const home = state.clubs[match.home_club_id]; const away = state.clubs[match.away_club_id];
            return <Link key={performance.id} href={`/matchs/${performance.match_id}`} className="block rounded-2xl border border-line/10 bg-surface/65 p-3 transition hover:border-accent/40"><div className="flex items-center gap-2"><ClubMark club={home} /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{home?.name || "—"}</span><b className="shrink-0 rounded-lg bg-bg/70 px-2.5 py-1.5 text-sm tabular-nums">{match.home_score ?? "–"} : {match.away_score ?? "–"}</b><span className="min-w-0 flex-1 truncate text-right text-xs font-semibold">{away?.name || "—"}</span><ClubMark club={away} /></div><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/10 pt-3 text-[11px] text-muted"><span>{new Date(match.kickoff).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}</span><span><b className="text-content">{performance.minutes ?? 0}</b> min</span>{performance.starter && <span>Titulaire</span>}{performance.goals > 0 && <b className="text-content">⚽ {performance.goals}</b>}{performance.assists > 0 && <b className="text-sky-300">A {performance.assists}</b>}{performance.rating != null && <b className={`ml-auto rounded-lg px-2 py-1 ${ratingTone(performance.rating)}`}>{Number(performance.rating).toFixed(1)}</b>}</div></Link>;
          })}</div> : <div className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-5 text-sm leading-6 text-muted">Les statistiques de saison sont disponibles. Les performances match par match apparaîtront après une synchronisation ciblée « Compositions & performances ».</div>}</section>

          <section><h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Statistiques par compétition</h2>{state.stats.length === 0 ? <p className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-5 text-sm text-muted">Pas encore de statistiques de saison.</p> : <div className="overflow-x-auto rounded-2xl border border-line/10"><table className="w-full min-w-[800px] text-sm"><thead className="bg-surface2 text-muted"><tr><th className="p-3 text-left">Compétition</th><th className="p-3 text-left">Club</th><th className="p-3 text-left">Saison</th><th>Matchs</th><th>Titu.</th><th>Min.</th><th>Buts</th><th>Passes</th><th>Note</th><th>🟨</th><th>🟥</th></tr></thead><tbody>{state.stats.map((stat) => <tr key={stat.id} className="border-t border-line/10 text-center"><td className="p-3 text-left font-semibold">{state.competitions[stat.competition_id]?.name || "Non attribuée"}</td><td className="p-3 text-left">{state.clubs[stat.club_id]?.name || "—"}</td><td className="p-3 text-left">{stat.season}</td><td>{stat.appearances ?? 0}</td><td>{stat.lineups ?? 0}</td><td>{stat.minutes ?? 0}</td><td className="font-bold">{stat.goals ?? 0}</td><td>{stat.assists ?? 0}</td><td>{stat.rating != null ? <b className={`inline-flex min-w-10 justify-center rounded-md px-1.5 py-1 text-xs ${ratingTone(stat.rating)}`}>{Number(stat.rating).toFixed(1)}</b> : "—"}</td><td>{stat.yellow ?? 0}</td><td>{stat.red ?? 0}</td></tr>)}</tbody></table></div>}</section>
        </div>
      </div>
    </div>
  );
}
