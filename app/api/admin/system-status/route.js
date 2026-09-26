import { getAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const EXPECTED_MIGRATIONS = {
  core: ["0002_profile_role_hardening", "0003_media_storage_hardening", "0004_job_execution_guardrails", "0005_persistent_pipeline_runs"],
  football: ["0023_season_safe_sync", "0024_player_team_seasons", "0025_membership_backfill_repair", "0026_match_center_live", "0027_national_teams", "0028_followed_national_teams", "0029_national_fifa_ranking", "0030_backfill_seasons", "0031_diable_ratings", "0032_season_rollout", "0033_history_foundations", "0034_match_sync_state"],
};

async function requireAdmin(request, db) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { response: new Response("Unauthorized", { status: 401 }) };
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { response: new Response("Unauthorized", { status: 401 }) };
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { response: new Response("Forbidden", { status: 403 }) };
  return { user };
}

async function probe(label, query) {
  try {
    const { error } = await query;
    return { label, ok: !error, detail: error?.message || "Disponible" };
  } catch (error) {
    return { label, ok: false, detail: error.message || String(error) };
  }
}

export async function GET(request) {
  try {
    const db = getAdmin();
    const auth = await requireAdmin(request, db);
    if (auth.response) return auth.response;

    const [migrationResult, competitionsResult, seasonsResult, playersResult, ...checks] = await Promise.all([
      db.from("schema_migrations").select("module,version,applied_at").order("applied_at", { ascending: false }),
      db.from("competitions").select("id,live_enabled,public_visible", { count: "exact" }),
      db.from("seasons").select("id,label,import_status,public_active", { count: "exact" }),
      db.from("players").select("id", { count: "exact", head: true }).eq("tracked", true).eq("active", true),
      probe("Garde-fous des synchronisations", db.from("job_runs").select("target_key,request_count,request_limit,heartbeat_at,params").limit(1)),
      probe("Saisons et zones par phase", db.from("seasons").select("zones_by_phase").limit(1)),
      probe("Portail et direct des compétitions", db.from("competitions").select("portal_background_url,live_enabled,live_refresh_seconds").limit(1)),
      probe("Relations équipes premières/U23", db.from("clubs").select("team_type,parent_club_id").limit(1)),
      probe("Affectations joueur-équipe-saison", db.from("player_team_seasons").select("id,season,squad_role").limit(1)),
      probe("Compositions de match", db.from("match_lineups").select("id").limit(1)),
      probe("Performances individuelles", db.from("match_player_stats").select("id").limit(1)),
      probe("Sélections et convocations", db.from("clubs").select("national_followed,national_category").eq("team_type", "national").limit(1)),
      probe("Bascule progressive des saisons", db.from("seasons").select("import_status,public_active,activated_at").limit(1)),
      probe("Pipelines persistants", db.from("pipeline_runs").select("next_step,request_count,heartbeat_at").limit(1)),
      probe("Carrières importées par lots", db.from("players").select("career_sync_status,career_synced_at").limit(1)),
      probe("Convocations historisées par match", db.from("national_match_callups").select("match_id,national_team_id,status,locked").limit(1)),
      probe("États de synchronisation par match", db.from("matches").select("events_synced_at,lineups_synced_at,player_stats_synced_at").limit(1)),
    ]);

    const applied = migrationResult.data || [];
    const appliedKeys = new Set(applied.map((row) => `${row.module}:${row.version}`));
    const migrations = Object.entries(EXPECTED_MIGRATIONS).flatMap(([module, versions]) => versions.map((version) => ({
      module,
      version,
      applied: appliedKeys.has(`${module}:${version}`),
      applied_at: applied.find((row) => row.module === module && row.version === version)?.applied_at || null,
    })));
    const competitions = competitionsResult.data || [];
    const seasons = seasonsResult.data || [];
    const currentSeasonCount = seasons.filter((season) => /2026/.test(season.label || "")).length;

    return Response.json({
      generated_at: new Date().toISOString(),
      environment: [
        { label: "Supabase public", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), required: true },
        { label: "Supabase serveur", ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), required: true },
        { label: "API-Football", ok: Boolean(process.env.APIFOOTBALL_KEY), required: false },
        { label: "Secret des jobs", ok: Boolean(process.env.JOBS_SECRET), required: true },
        { label: "Secret du cron", ok: Boolean(process.env.CRON_SECRET), required: false },
      ],
      migrations,
      checks,
      data: {
        competitions: competitionsResult.count ?? competitions.length,
        public_competitions: competitions.filter((competition) => competition.public_visible !== false).length,
        live_competitions: competitions.filter((competition) => competition.live_enabled).length,
        seasons: seasonsResult.count ?? seasons.length,
        seasons_2026: currentSeasonCount,
        active_seasons: seasons.filter((season) => season.public_active).length,
        tracked_players: playersResult.count ?? 0,
      },
      errors: [migrationResult.error, competitionsResult.error, seasonsResult.error, playersResult.error].filter(Boolean).map((error) => error.message),
    });
  } catch (error) {
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}
