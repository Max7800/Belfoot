// Diagnostic en lecture seule d'une compétition API-Football : saisons
// exposées par l'API (dates, saison en cours, couverture des classements) et,
// si une saison est choisie, ses groupes de classement. Deux appels au plus.
// N'écrit RIEN en base (ni compétition, ni saison, ni match) : seul le journal
// job_runs de runJob enregistre l'exécution et son résultat.
import "@/modules/football/apifootball";
import { getProvider } from "../providers";
import { requireCompetitionId } from "@/lib/jobScope";
import { requestedApiYear, summarizeLeagueCheck } from "@/lib/leagueCheck";

const leagueCheckJob = {
  key: "football.league-check",
  async run({ db, competitionId, ...ctx }) {
    requireCompetitionId("football.league-check", competitionId);
    const { data: competition, error } = await db.from("competitions").select("id,name,provider,external_id").eq("id", competitionId).maybeSingle();
    if (error) throw error;
    if (!competition) return "Compétition introuvable : aucun appel API.";
    if (competition.provider !== "apifootball" || !competition.external_id) return "Vérification réservée aux compétitions API-Football avec identifiant : aucun appel API.";

    const provider = getProvider("apifootball");
    const league = await provider.fetchLeagueSeasons(competition, ctx);
    const standingsYear = requestedApiYear(ctx.season);
    const standings = standingsYear ? await provider.fetchStandings(competition, { ...ctx, season: standingsYear }) : null;

    const { data: seasons, error: seasonsError } = await db.from("seasons").select("id,label,import_status,public_active").eq("competition_id", competition.id);
    if (seasonsError) throw seasonsError;
    const belfootSeasons = [];
    for (const season of seasons || []) {
      const { count, error: countError } = await db.from("matches").select("id", { count: "exact", head: true }).eq("season_id", season.id);
      if (countError) throw countError;
      belfootSeasons.push({ ...season, matches: count ?? 0 });
    }
    return summarizeLeagueCheck({ competition, league, standingsYear, standings, belfootSeasons });
  },
};

export default leagueCheckJob;
