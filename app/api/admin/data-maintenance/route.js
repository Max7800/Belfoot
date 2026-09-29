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

export async function POST(request) {
  const auth = await adminContext(request);
  if (auth.response) return auth.response;
  const input = await request.json().catch(() => ({}));
  if (input.action !== "analyze") return Response.json({ error: "Seule l’analyse en lecture seule est disponible." }, { status: 400 });
  if (!input.seasonId) return Response.json({ error: "Choisis une saison à analyser." }, { status: 400 });

  try {
    const { db } = auth;
    const { data: season, error: seasonError } = await db.from("seasons")
      .select("id,label,competition_id,import_status,public_active,competitions(id,name,competition_scope)")
      .eq("id", input.seasonId)
      .maybeSingle();
    if (seasonError) throw seasonError;
    if (!season) return Response.json({ error: "Saison introuvable." }, { status: 404 });

    const { data: matches, error: matchesError } = await db.from("matches")
      .select("id,home_club_id,away_club_id")
      .eq("season_id", season.id)
      .limit(1000);
    if (matchesError) throw matchesError;
    const matchIds = (matches || []).map((match) => match.id);
    const clubIds = [...new Set((matches || []).flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];

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
    if (clubIds.length) {
      const [membershipResult, protectedResult] = await Promise.all([
        db.from("player_team_seasons").select("id", { count: "exact", head: true }).eq("season", season.label).in("club_id", clubIds),
        db.from("player_team_seasons").select("id", { count: "exact", head: true }).eq("season", season.label).in("club_id", clubIds).or("locked.eq.true,source.eq.manual"),
      ]);
      if (membershipResult.error) throw membershipResult.error;
      if (protectedResult.error) throw protectedResult.error;
      memberships = membershipResult.count || 0;
      protectedMemberships = protectedResult.count || 0;
    }

    return Response.json({
      mode: "read-only",
      season: { id: season.id, label: season.label, importStatus: season.import_status, publicActive: season.public_active },
      competition: season.competitions,
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
      nextStep: "Attribuer un niveau de couverture aux clubs avant d’autoriser l’archivage des détails secondaires.",
    });
  } catch (error) {
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}
