import { getAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function adminContext(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const db = getAdmin();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { db };
}

async function countByMatchIds(db, table, matchIds, extra = null) {
  let total = 0;
  for (let index = 0; index < matchIds.length; index += 100) {
    let query = db.from(table).select("id", { count: "exact", head: true }).in("match_id", matchIds.slice(index, index + 100));
    if (extra) query = extra(query);
    const { count, error } = await query;
    if (error) throw error;
    total += count || 0;
  }
  return total;
}

const isBelgianSelection = (team) => /^(belgium|belgique)(\s|$)/i.test(team?.name || "") || /^(belgium|belgique)$/i.test(team?.ext?.country || team?.ext?.team?.country || "");

async function auditProviderDuplicates(db) {
  const [competitionResult, seasonResult, matchResult, nationalTeamResult] = await Promise.all([
    db.from("competitions").select("id,name,slug,provider,external_id,public_visible,competition_scope").not("provider", "is", null),
    db.from("seasons").select("id,label,competition_id,import_status,public_active"),
    db.from("matches").select("id,competition_id").range(0, 9999),
    db.from("clubs").select("id,name,external_id,national_category,national_gender,national_followed,ext").eq("team_type", "national"),
  ]);
  const error = competitionResult.error || seasonResult.error || matchResult.error || nationalTeamResult.error;
  if (error) throw error;
  const seasonsByCompetition = (seasonResult.data || []).reduce((map, season) => {
    const rows = map.get(season.competition_id) || []; rows.push(season); map.set(season.competition_id, rows); return map;
  }, new Map());
  const matchesByCompetition = (matchResult.data || []).reduce((map, match) => map.set(match.competition_id, (map.get(match.competition_id) || 0) + 1), new Map());
  const groups = new Map();
  for (const competition of competitionResult.data || []) {
    if (!competition.external_id) continue;
    const key = `${competition.provider}:${competition.external_id}`;
    const rows = groups.get(key) || []; rows.push(competition); groups.set(key, rows);
  }
  const duplicates = [...groups.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({
    key,
    provider: rows[0].provider,
    externalId: rows[0].external_id,
    rows: rows.map((competition) => ({
      id: competition.id, name: competition.name, slug: competition.slug, scope: competition.competition_scope || "national", publicVisible: competition.public_visible !== false,
      seasons: (seasonsByCompetition.get(competition.id) || []).map((season) => ({ id: season.id, label: season.label, status: season.import_status, publicActive: season.public_active })),
      matches: matchesByCompetition.get(competition.id) || 0,
    })),
  }));
  return {
    duplicates,
    belgianSelections: (nationalTeamResult.data || []).filter(isBelgianSelection).map((team) => ({
      id: team.id, name: team.name, externalId: team.external_id, category: team.national_category || "à préciser", gender: team.national_gender || "men", followed: !!team.national_followed,
    })).sort((a, b) => ({ senior: 0, u21: 1, women: 2 }[a.category] ?? 9) - ({ senior: 0, u21: 1, women: 2 }[b.category] ?? 9)),
  };
}

export async function POST(request) {
  const auth = await adminContext(request);
  if (auth.response) return auth.response;
  const input = await request.json().catch(() => ({}));
  if (input.action === "audit-duplicates") {
    try { return Response.json({ mode: "read-only", ...(await auditProviderDuplicates(auth.db)) }); }
    catch (error) { return Response.json({ error: error.message || String(error) }, { status: 500 }); }
  }
  if (!input.seasonId) return Response.json({ error: "Choisis une saison à analyser." }, { status: 400 });

  try {
    const { db } = auth;
    const { data: season, error: seasonError } = await db.from("seasons")
      .select("id,label,competition_id,import_status,public_active,competitions(id,name,competition_scope,competition_type)")
      .eq("id", input.seasonId)
      .maybeSingle();
    if (seasonError) throw seasonError;
    if (!season) return Response.json({ error: "Saison introuvable." }, { status: 404 });

    if (["preview", "archive"].includes(input.action)) {
      if (input.action === "archive" && input.confirmation !== season.competitions?.name) {
        return Response.json({ error: `Recopie exactement « ${season.competitions?.name} » pour confirmer.` }, { status: 400 });
      }
      const { data, error } = await db.rpc("archive_secondary_club_data", { target_season: season.id, apply_changes: input.action === "archive" });
      if (error) throw error;
      return Response.json({ action: input.action, result: data });
    }

    if (input.action === "save-coverage") {
      const allowed = new Set(["results", "match", "full"]);
      const rows = Array.isArray(input.coverage) ? input.coverage.filter((row) => row.clubId && allowed.has(row.level)) : [];
      if (!rows.length) return Response.json({ error: "Aucun niveau de couverture valide." }, { status: 400 });
      const { error } = await db.from("club_season_coverage").upsert(rows.map((row) => ({
        competition_id: season.competition_id,
        season_id: season.id,
        club_id: row.clubId,
        coverage_level: row.level,
        reason: row.reason || "Choix administrateur",
        source: "manual",
        locked: true,
        updated_at: new Date().toISOString(),
      })), { onConflict: "competition_id,season_id,club_id" });
      if (error) throw error;
    } else if (input.action !== "analyze") {
      return Response.json({ error: "Action d’entretien inconnue." }, { status: 400 });
    }

    const { data: matches, error: matchesError } = await db.from("matches")
      .select("id,home_club_id,away_club_id,phase")
      .eq("season_id", season.id)
      .limit(1000);
    if (matchesError) throw matchesError;
    const matchIds = (matches || []).map((match) => match.id);
    const clubIds = [...new Set((matches || []).flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
    const mainStageClubIds = new Set((matches || [])
      .filter((match) => /league|group|round of|knockout|quarter|semi|final/i.test(String(match.phase || "")) && !/qualif|prelim/i.test(String(match.phase || "")))
      .flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean));

    const detailCounts = matchIds.length ? await Promise.all([
      countByMatchIds(db, "match_events", matchIds),
      countByMatchIds(db, "match_lineups", matchIds),
      countByMatchIds(db, "match_player_stats", matchIds),
      countByMatchIds(db, "match_team_stats", matchIds),
      countByMatchIds(db, "match_lineups", matchIds, (query) => query.eq("locked", true)),
      countByMatchIds(db, "match_player_stats", matchIds, (query) => query.eq("locked", true)),
      countByMatchIds(db, "match_team_stats", matchIds, (query) => query.eq("locked", true)),
    ]) : [0, 0, 0, 0, 0, 0, 0];

    let memberships = 0;
    let protectedMemberships = 0;
    let membershipRows = [];
    if (clubIds.length) {
      const [membershipResult, protectedResult, membershipRowsResult] = await Promise.all([
        db.from("player_team_seasons").select("id", { count: "exact", head: true }).eq("season", season.label).in("club_id", clubIds),
        db.from("player_team_seasons").select("id", { count: "exact", head: true }).eq("season", season.label).in("club_id", clubIds).or("locked.eq.true,source.eq.manual"),
        db.from("player_team_seasons").select("club_id,player_id").eq("season", season.label).in("club_id", clubIds),
      ]);
      if (membershipResult.error) throw membershipResult.error;
      if (protectedResult.error) throw protectedResult.error;
      if (membershipRowsResult.error) throw membershipRowsResult.error;
      memberships = membershipResult.count || 0;
      protectedMemberships = protectedResult.count || 0;
      membershipRows = membershipRowsResult.data || [];
    }

    const playerIds = [...new Set(membershipRows.map((row) => row.player_id).filter(Boolean))];
    const [clubsResult, trackedResult, coverageResult] = await Promise.all([
      clubIds.length ? db.from("clubs").select("id,name,logo_url,team_type,ext,locked,source").in("id", clubIds).order("name") : Promise.resolve({ data: [], error: null }),
      playerIds.length ? db.from("players").select("id,club_id").in("id", playerIds).eq("tracked", true) : Promise.resolve({ data: [], error: null }),
      db.from("club_season_coverage").select("club_id,coverage_level,reason,locked,archived_at").eq("season_id", season.id),
    ]);
    if (clubsResult.error) throw clubsResult.error;
    if (trackedResult.error) throw trackedResult.error;
    if (coverageResult.error) throw coverageResult.error;
    const trackedIds = new Set((trackedResult.data || []).map((player) => player.id));
    const membershipByClub = membershipRows.reduce((map, row) => { const list = map.get(row.club_id) || []; list.push(row); map.set(row.club_id, list); return map; }, new Map());
    const coverageByClub = Object.fromEntries((coverageResult.data || []).map((row) => [row.club_id, row]));
    const scope = season.competitions?.competition_scope || "national";
    const type = season.competitions?.competition_type || "league";
    const clubs = (clubsResult.data || []).map((club) => {
      const trackedPlayers = (membershipByClub.get(club.id) || []).filter((membership) => trackedIds.has(membership.player_id)).length;
      const country = String(club.ext?.country || "").toLowerCase();
      const belgian = /belg/.test(country) || /^belg(i(um|que)|ique)$/i.test(club.name || "");
      const suggested = trackedPlayers ? "full"
        : scope === "europe" ? (belgian || mainStageClubIds.has(club.id) ? "full" : "results")
          : scope === "international" ? (belgian ? "full" : "match")
            : type === "league" ? "full" : "match";
      const stored = coverageByClub[club.id];
      return { id: club.id, name: club.name, logoUrl: club.logo_url, teamType: club.team_type, trackedPlayers, suggested, level: stored?.coverage_level || suggested, reason: stored?.reason || (trackedPlayers ? "Joueur belge suivi" : suggested === "full" ? "Couverture prioritaire" : suggested === "match" ? "Matchs détaillés uniquement" : "Résultats et parcours uniquement"), saved: !!stored, archivedAt: stored?.archived_at || null };
    });

    return Response.json({
      mode: input.action === "save-coverage" ? "configured" : "read-only",
      season: { id: season.id, label: season.label, importStatus: season.import_status, publicActive: season.public_active },
      competition: season.competitions,
      clubs,
      counts: {
        matches: matchIds.length,
        clubs: clubIds.length,
        memberships,
        events: detailCounts[0],
        lineups: detailCounts[1],
        playerStats: detailCounts[2],
        teamStats: detailCounts[3],
        protectedRows: protectedMemberships + detailCounts[4] + detailCounts[5] + detailCounts[6],
      },
      safeguards: [
        "Les clubs, matchs, résultats, classements et palmarès restent toujours conservés.",
        "Les données manuelles ou verrouillées ne seront jamais archivées par une automatisation.",
        "Les joueurs belges suivis et les joueurs reliés à une sélection resteront protégés.",
      ],
      nextStep: clubs.every((club) => club.saved) ? "Les niveaux sont enregistrés. Lance une simulation de purge avant toute confirmation." : "Vérifie puis enregistre les niveaux de couverture proposés pour chaque club.",
    });
  } catch (error) {
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}
