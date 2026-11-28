import { selectAllPages } from "@/modules/football/sync";

const SAMPLE_SIZE = 10;
const TYPES = [
  { key: "events", label: "Événements", table: "match_events", marker: "events_synced_at", coverage: "events", migration: "0034_match_sync_state" },
  { key: "lineups", label: "Compositions", table: "match_lineups", marker: "lineups_synced_at", coverage: "lineups", migration: "0034_match_sync_state" },
  { key: "players", label: "Lignes joueurs", table: "match_player_stats", marker: "player_stats_synced_at", coverage: "statistics_players", migration: "0034_match_sync_state" },
  { key: "teams", label: "Statistiques collectives", table: "match_team_stats", marker: "team_stats_synced_at", coverage: "statistics_fixtures", migration: "0035_match_team_stats" },
];

// Échantillon informatif à la demande, sans inférer la réponse du fournisseur
// à partir des lignes actuellement enregistrées et sans toucher aux marqueurs.
export async function auditSeasonCoverage(db, seasonId) {
  const { data: season, error: seasonError } = await db.from("seasons").select("id,competition_id,label").eq("id", seasonId).maybeSingle();
  if (seasonError) throw seasonError;
  if (!season) throw new Error("Saison introuvable");
  const [competition, migrations] = await Promise.all([
    db.from("competitions").select("ext").eq("id", season.competition_id).maybeSingle(),
    db.from("schema_migrations").select("version").eq("module", "football"),
  ]);
  if (competition.error || migrations.error) throw competition.error || migrations.error;
  if (!competition.data) throw new Error("Compétition introuvable");
  const applied = new Set((migrations.data || []).map((row) => row.version));
  const flags = competition.data.ext?.coverage?.fixtures || {};
  const types = TYPES.filter((type) => applied.has(type.migration) && flags[type.coverage] !== false);
  if (!types.length) return { sampleSize: 0, types: [] };
  const columns = ["id", ...types.map((type) => type.marker)].join(",");
  const { data: matches, error: matchError } = await db.from("matches").select(columns)
    .eq("season_id", season.id).eq("competition_id", season.competition_id)
    .eq("status", "finished").not("external_id", "is", null)
    .order("kickoff", { ascending: false, nullsFirst: false }).order("id").limit(SAMPLE_SIZE);
  if (matchError) throw matchError;
  const sample = matches || [];
  const results = await Promise.all(types.map(async (type) => {
    const ids = sample.filter((match) => match[type.marker]).map((match) => match.id);
    if (!ids.length) return { key: type.key, label: type.label, checked: 0, withoutRows: 0 };
    const rows = await selectAllPages(() => db.from(type.table).select("id,match_id").in("match_id", ids).order("id"));
    const present = new Set(rows.map((row) => row.match_id));
    return { key: type.key, label: type.label, checked: ids.length, withoutRows: ids.filter((id) => !present.has(id)).length };
  }));
  return { sampleSize: sample.length, types: results };
}
