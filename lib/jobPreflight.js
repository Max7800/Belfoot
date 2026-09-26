import { JOB_CATALOG, JOB_PIPELINES } from "@/lib/jobCatalog";
import { assertImportTargetAllowed } from "@/lib/importPlan";
import { seasonLabel, seasonYear } from "@/modules/football/season";

export function requiredMigrationsForJob(key, season) {
  return [
    { module: "core", version: "0004_job_execution_guardrails" },
    ...(JOB_CATALOG[key]?.requiresMigrations || []),
    ...(Number(seasonYear(season)) >= 2026 ? [{ module: "football", version: "0032_season_rollout" }] : []),
  ];
}

async function migrationState(db, requirements) {
  const unique = [...new Map(requirements.map((item) => [`${item.module}/${item.version}`, item])).values()];
  if (!unique.length) return { required: [], missing: [] };
  const { data, error } = await db.from("schema_migrations").select("module,version");
  if (error) throw error;
  const applied = new Set((data || []).map((item) => `${item.module}/${item.version}`));
  return { required: unique, missing: unique.filter((item) => !applied.has(`${item.module}/${item.version}`)) };
}

async function competitionContext(db, ctx) {
  if (!ctx.competitionId) return { competition: null, matches: [], clubIds: [] };
  const { data: competition, error: competitionError } = await db.from("competitions").select("id,name,provider,external_id,ext,live_enabled").eq("id", ctx.competitionId).maybeSingle();
  if (competitionError) throw competitionError;
  if (!competition) return { competition: null, matches: [], clubIds: [] };
  const { data: season } = await db.from("seasons").select("id,label").eq("competition_id", competition.id).eq("label", seasonLabel(ctx.season)).maybeSingle();
  let query = db.from("matches").select("id,status,kickoff,home_club_id,away_club_id,external_id,events_synced_at,lineups_synced_at,player_stats_synced_at").eq("competition_id", competition.id);
  if (season?.id) query = query.eq("season_id", season.id);
  const { data: matches, error: matchesError } = await query.order("kickoff", { ascending: false }).limit(500);
  if (matchesError) throw matchesError;
  const clubIds = [...new Set((matches || []).flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
  return { competition, matches: matches || [], clubIds };
}

async function estimateJob(db, key, ctx, context) {
  const cap = Math.max(1, Math.min(Number(ctx.matchCap) || 3, 40));
  const clubs = context.clubIds.length;
  if (key === "football.sync") return { min: 1, max: 3, basis: "matchs, clubs et informations de ligue" };
  if (["football.squads", "football.discover-belgians"].includes(key)) return { min: clubs ? clubs : 0, max: clubs * 3, basis: `${clubs} club(s) détecté(s) dans la saison` };
  if (key === "football.coaches") return { min: 0, max: clubs, basis: `${clubs} club(s), les entraîneurs verrouillés seront ignorés` };
  if (key === "football.events") {
    const eligible = context.matches.filter((match) => match.status === "finished" && match.external_id && !match.events_synced_at).length;
    return { min: 0, max: Math.min(cap, eligible), basis: `${eligible} match(s) terminé(s), plafond ${cap}` };
  }
  if (key === "football.lineups") {
    const fixtures = context.competition?.ext?.coverage?.fixtures || {};
    const canLineups = fixtures.lineups !== false;
    const canStats = fixtures.statistics_players !== false;
    const eligible = context.matches.filter((match) => match.external_id && (match.status === "live"
      || (match.status === "finished" && ((canLineups && !match.lineups_synced_at) || (canStats && !match.player_stats_synced_at)))));
    const selected = eligible.slice(0, Math.min(cap, 20));
    const requests = selected.reduce((sum, match) => sum
      + Number(canLineups && (match.status === "live" || !match.lineups_synced_at))
      + Number(canStats && (match.status === "live" || !match.player_stats_synced_at)), 0);
    return { min: 0, max: requests, basis: `${selected.length} match(s), ${requests} endpoint(s) encore nécessaire(s)` };
  }
  if (key === "football.team-test") return { min: 4, max: 4, basis: "ligue, club, matchs et effectif du club test" };
  if (key === "football.track-belgians") {
    if (!context.competition) return { min: 0, max: 0, basis: "compétition introuvable" };
    let playerQuery = db.from("players").select("id", { count: "exact", head: true }).eq("tracked", true).eq("active", true).eq("source", context.competition.provider);
    if (context.clubIds.length) playerQuery = playerQuery.in("club_id", context.clubIds);
    const { count, error } = await playerQuery;
    if (error) throw error;
    return { min: 0, max: count || 0, basis: `${count || 0} joueur(s) suivi(s) dans les clubs de la compétition` };
  }
  if (key === "football.player-careers") {
    if (!context.competition || !context.clubIds.length) return { min: 0, max: 0, basis: "aucun club dans la compétition" };
    const batchSize = Math.max(1, Math.min(Number(ctx.batchSize) || 5, 25));
    const { count, error } = await db.from("players").select("id", { count: "exact", head: true })
      .eq("tracked", true).eq("active", true).eq("source", context.competition.provider)
      .in("club_id", context.clubIds);
    if (error) throw error;
    return { min: 0, max: Math.min(batchSize, count || 0), basis: `${count || 0} joueur(s) éligible(s), lot plafonné à ${batchSize}` };
  }
  if (key === "football.find-national-teams") return { min: 1, max: 1, basis: "une recherche d’équipes" };
  if (key === "football.national-team") return { min: 3, max: 3, basis: "fiche, matchs et effectif de la sélection" };
  if (key === "football.resolve-national-clubs") {
    const { data: team } = await db.from("clubs").select("id").eq("source", "apifootball").eq("external_id", ctx.teamExternalId).eq("team_type", "national").maybeSingle();
    if (!team) return { min: 0, max: 0, basis: "sélection pas encore synchronisée" };
    const { data: callups } = await db.from("national_team_callups").select("player_id").eq("national_team_id", team.id).eq("season", seasonLabel(ctx.season)).eq("active", true);
    const playerIds = [...new Set((callups || []).map((item) => item.player_id).filter(Boolean))];
    if (!playerIds.length) return { min: 0, max: 0, basis: "aucun appelé actif à compléter" };
    const { data: players } = await db.from("players").select("id,club_id").in("id", playerIds);
    const unresolved = (players || []).filter((player) => !player.club_id).length;
    return { min: 0, max: Math.min(cap, unresolved), basis: `${unresolved} joueur(s) sans club, plafond ${cap}` };
  }
  if (key === "football.live-sync") {
    let competitionQuery = db.from("competitions").select("id").not("provider", "is", null);
    competitionQuery = ctx.competitionId ? competitionQuery.eq("id", ctx.competitionId) : competitionQuery.eq("live_enabled", true);
    const { data: competitions, error } = await competitionQuery;
    if (error) throw error;
    let liveMatches = 0;
    let remaining = cap;
    for (const competition of competitions || []) {
      const { count } = await db.from("matches").select("id", { count: "exact", head: true }).eq("competition_id", competition.id).eq("status", "live");
      const selected = Math.min(remaining, count || 0);
      liveMatches += selected;
      remaining -= selected;
    }
    return { min: (competitions || []).length, max: (competitions || []).length + liveMatches, basis: `${(competitions || []).length} compétition(s) + ${liveMatches} match(s) actuellement live` };
  }
  return { min: 0, max: Number(ctx.requestLimit) || 10, basis: "coût variable, borné par le budget strict" };
}

export async function preflightJobs(db, input = {}) {
  const pipeline = input.pipelineKey ? JOB_PIPELINES.find((item) => item.key === input.pipelineKey) : null;
  const keys = pipeline?.jobs || (input.key ? [input.key] : []);
  if (!keys.length || keys.some((key) => !JOB_CATALOG[key])) throw new Error("Job ou pipeline inconnu");
  const context = await competitionContext(db, input);
  const blockers = [];
  for (const key of keys) {
    try { await assertImportTargetAllowed(db, key, input, JOB_CATALOG[key]); }
    catch (error) { blockers.push(error.message || String(error)); }
  }
  if (keys.some((key) => JOB_CATALOG[key]?.target === "competition") && !context.competition) blockers.push("La compétition ciblée est introuvable.");
  const migrations = await migrationState(db, keys.flatMap((key) => requiredMigrationsForJob(key, input.season)));
  blockers.push(...migrations.missing.map((item) => `Migration manquante : ${item.module}/${item.version}`));
  const steps = [];
  for (const key of keys) steps.push({ key, label: JOB_CATALOG[key].label, ...(await estimateJob(db, key, input, context)) });
  const total = steps.reduce((sum, step) => sum + step.max, 0);
  const budget = Math.max(1, Math.min(Number(input.requestLimit) || 10, 100));
  const warnings = [];
  if (total > budget) blockers.push(`Le coût maximal estimé (${total}) dépasse le budget strict (${budget}).`);
  const { data: latest } = await db.from("job_runs").select("quota_remaining,finished_at").not("quota_remaining", "is", null).order("finished_at", { ascending: false }).limit(1).maybeSingle();
  if (latest?.quota_remaining != null && total > latest.quota_remaining) {
    const observationAge = Date.now() - new Date(latest.finished_at || 0).getTime();
    const message = `Le coût maximal estimé (${total}) dépasse le dernier quota connu (${latest.quota_remaining}).`;
    if (observationAge < 15 * 60 * 1000) blockers.push(message);
    else warnings.push(`${message} Cette mesure a plus de 15 minutes et doit être rafraîchie.`);
  }
  return {
    ok: blockers.length === 0,
    target: context.competition?.name || (input.teamExternalId ? `Équipe API ${input.teamExternalId}` : "Cibles direct activées"),
    season: input.season || null,
    steps,
    total: { min: steps.reduce((sum, step) => sum + step.min, 0), max: total },
    budget,
    quotaRemaining: latest?.quota_remaining ?? null,
    quotaObservedAt: latest?.finished_at || null,
    migrations,
    warnings,
    blockers: [...new Set(blockers)],
  };
}
