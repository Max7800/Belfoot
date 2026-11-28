// File d'attente partagée par les jobs et leur préflight : filtrer AVANT de
// limiter, sinon les matchs anciens incomplets peuvent rester invisibles.
export async function loadPendingDetails(db, { competitionId, seasonId, kind, coverage = {}, includeLive = false, limit = 500 }) {
  if (!seasonId) return { rows: [], count: 0 };
  const columns = kind === "events" ? "id,external_id,status,kickoff,events_synced_at" : "id,external_id,competition_id,status,kickoff,home_club_id,away_club_id,lineups_synced_at,player_stats_synced_at,team_stats_synced_at";
  let query = db.from("matches")
    .select(columns, { count: "exact" })
    .eq("competition_id", competitionId).eq("season_id", seasonId).not("external_id", "is", null);
  if (kind === "events") {
    query = query.eq("status", "finished").is("events_synced_at", null);
  } else {
    const filters = [
      ...(includeLive ? ["status.eq.live"] : []),
      ...(coverage.lineups ? ["lineups_synced_at.is.null"] : []),
      ...(coverage.playerStats ? ["player_stats_synced_at.is.null"] : []),
      ...(coverage.teamStats ? ["team_stats_synced_at.is.null"] : []),
    ];
    if (!filters.length) return { rows: [], count: 0 };
    query = query.in("status", includeLive ? ["finished", "live"] : ["finished"]).or(filters.join(","));
  }
  const { data, error, count } = await query.order("kickoff", { ascending: false }).order("id").limit(limit);
  if (error) throw error;
  // Un count absent ne doit pas conduire à déclarer à jour une file tronquée.
  if (count == null) throw new Error("Nombre de matchs en attente indisponible");
  if (count > 0 && !data?.length) throw new Error("Matchs en attente illisibles");
  return { rows: data || [], count };
}
