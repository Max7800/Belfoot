import { normalizeImportPlan, IMPORT_SCOPES, resolveCompetitionSeasonEstimate } from "./importPlan";
import { seasonYear } from "@/modules/football/season";

const SCOPE_LEVEL = { base: 0, squads: 1, complete: 2 };

function requirement(module, version) {
  return { module, version, key: `${module}:${version}` };
}

function requiredMigrations(scope) {
  return [
    requirement("core", "0004_job_execution_guardrails"),
    requirement("football", "0023_season_safe_sync"),
    requirement("football", "0032_season_rollout"),
    ...(SCOPE_LEVEL[scope] >= 1 ? [requirement("football", "0024_player_team_seasons")] : []),
    ...(SCOPE_LEVEL[scope] >= 2 ? [requirement("football", "0033_history_foundations"), requirement("football", "0034_match_sync_state"), requirement("football", "0035_match_team_stats")] : []),
  ];
}

function check(key, label, ok, detail, blocking = true) {
  return { key, label, ok: Boolean(ok), detail, blocking };
}

export async function auditSeasonReadiness(db, seasonId) {
  const { data: season, error: seasonError } = await db.from("seasons").select("id,label,competition_id,import_status,public_active,activated_at").eq("id", seasonId).maybeSingle();
  if (seasonError) throw seasonError;
  if (!season) throw new Error("Saison introuvable");

  const [{ data: competition, error: competitionError }, { data: settings, error: settingsError }, { data: migrationRows, error: migrationError }] = await Promise.all([
    db.from("competitions").select("id,name,external_id,provider,ext").eq("id", season.competition_id).maybeSingle(),
    db.from("site_settings").select("data").eq("id", 1).maybeSingle(),
    db.from("schema_migrations").select("module,version"),
  ]);
  if (competitionError || settingsError || migrationError) throw competitionError || settingsError || migrationError;
  if (!competition) throw new Error("Compétition introuvable");

  const plan = normalizeImportPlan(settings?.data?.football_import_plan);
  const competitionPlan = plan.competitions[String(competition.id)] || null;
  const target = competitionPlan?.seasons?.[season.label] || null;
  const scope = IMPORT_SCOPES[target?.scope] ? target.scope : "base";
  const applied = new Set((migrationRows || []).map((row) => `${row.module}:${row.version}`));
  const migrations = requiredMigrations(scope);
  const rolloutMarkersAvailable = applied.has("football:0034_match_sync_state");
  const teamStatsAvailable = applied.has("football:0035_match_team_stats");
  const matchColumns = `id,status,external_id,home_club_id,away_club_id${rolloutMarkersAvailable ? ",events_synced_at,lineups_synced_at,player_stats_synced_at" : ""}${teamStatsAvailable ? ",team_stats_synced_at" : ""}`;
  const { data: matchRows, error: matchesError, count: matchCount } = await db.from("matches")
    .select(matchColumns, { count: "exact" })
    .eq("competition_id", competition.id)
    .eq("season_id", season.id)
    .range(0, 999);
  if (matchesError) throw matchesError;

  const matches = matchRows || [];
  const clubIds = [...new Set(matches.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
  let membershipCount = 0;
  if (SCOPE_LEVEL[scope] >= 1 && applied.has("football:0024_player_team_seasons") && clubIds.length) {
    // Les imports stockent l'année technique (`2026`) tandis que la saison
    // publique porte le libellé `2026-2027`. L'année de départ les relie.
    const { count, error } = await db.from("player_team_seasons").select("id", { count: "exact", head: true }).eq("season_start_year", Number(seasonYear(season.label))).in("club_id", clubIds);
    if (error) throw error;
    membershipCount = count || 0;
  }

  const finished = matches.filter((match) => match.status === "finished" && match.external_id);
  const fixturesCoverage = competition.ext?.coverage?.fixtures || {};
  const pendingEvents = rolloutMarkersAvailable && fixturesCoverage.events !== false ? finished.filter((match) => !match.events_synced_at).length : 0;
  const pendingLineups = rolloutMarkersAvailable && fixturesCoverage.lineups !== false ? finished.filter((match) => !match.lineups_synced_at).length : 0;
  const pendingPlayerStats = rolloutMarkersAvailable && fixturesCoverage.statistics_players !== false ? finished.filter((match) => !match.player_stats_synced_at).length : 0;
  const pendingTeamStats = teamStatsAvailable && fixturesCoverage.statistics_fixtures !== false ? finished.filter((match) => !match.team_stats_synced_at).length : finished.length;
  const seasonEstimate = resolveCompetitionSeasonEstimate(competition, competitionPlan, season.label, plan.version);
  const expectedMatches = seasonEstimate.expected_matches;
  const expectedClubs = seasonEstimate.expected_clubs;
  const minimumMemberships = Math.max(1, clubIds.length * 11);
  const targetEnabled = Boolean(competitionPlan?.enabled && target?.enabled);
  const missingMigrations = migrations.filter((item) => !applied.has(item.key));

  const checks = [
    check("whitelist", "Cible autorisée", targetEnabled, targetEnabled ? `${IMPORT_SCOPES[scope].label} pour ${season.label}` : "Compétition ou saison absente de la whitelist"),
    check("migrations", "Migrations nécessaires", missingMigrations.length === 0, missingMigrations.length ? missingMigrations.map((item) => `${item.module}/${item.version}`).join(", ") : "Toutes appliquées"),
    check("matches", "Calendrier importé", (matchCount || 0) > 0 && (!expectedMatches || (matchCount || 0) >= expectedMatches), `${matchCount || 0}${expectedMatches ? ` / ${expectedMatches} attendus` : " match(s)"}`),
    check("clubs", "Clubs reliés", clubIds.length > 0 && (!expectedClubs || clubIds.length >= expectedClubs), `${clubIds.length}${expectedClubs ? ` / ${expectedClubs} attendus` : " club(s)"}`),
  ];
  if (SCOPE_LEVEL[scope] >= 1) checks.push(check("squads", "Effectifs par saison", membershipCount >= minimumMemberships, `${membershipCount} affectations · minimum de contrôle ${minimumMemberships}`));
  if (SCOPE_LEVEL[scope] >= 2) {
    if (fixturesCoverage.events !== false) checks.push(check("events", "Événements terminés", rolloutMarkersAvailable && pendingEvents === 0, `${pendingEvents} match(s) restant(s)`));
    if (fixturesCoverage.lineups !== false) checks.push(check("lineups", "Compositions terminées", rolloutMarkersAvailable && pendingLineups === 0, `${pendingLineups} match(s) restant(s)`));
    if (fixturesCoverage.statistics_players !== false) checks.push(check("player-stats", "Performances terminées", rolloutMarkersAvailable && pendingPlayerStats === 0, `${pendingPlayerStats} match(s) restant(s)`));
    if (fixturesCoverage.statistics_fixtures !== false) checks.push(check("team-stats", "Statistiques collectives terminées", teamStatsAvailable && pendingTeamStats === 0, `${pendingTeamStats} match(s) restant(s)`));
  }
  const blockingChecks = checks.filter((item) => item.blocking);
  const passed = blockingChecks.filter((item) => item.ok).length;
  return {
    season,
    competition: { id: competition.id, name: competition.name },
    scope,
    scopeLabel: IMPORT_SCOPES[scope].label,
    ok: blockingChecks.every((item) => item.ok),
    progress: blockingChecks.length ? Math.round((passed / blockingChecks.length) * 100) : 0,
    checks,
    counts: {
      matches: matchCount || 0,
      expectedMatches,
      clubs: clubIds.length,
      expectedClubs,
      memberships: membershipCount,
      finished: finished.length,
      pendingEvents,
      pendingLineups,
      pendingPlayerStats,
      pendingTeamStats,
    },
  };
}
