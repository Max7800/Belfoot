import { UNKNOWN_COUNTRY, UNKNOWN_COMPETITION } from "@/lib/belgiansAbroad";
import { currentSeasonStart, seasonTotals } from "@/lib/belgiansRankings";
import { isRecentPerformance, loadAbroadPerformances } from "@/lib/abroadExperience";
import { isNationalSelectionClub } from "@/lib/nationalities";
import { belgianWatchStatus, isBelgianFollowed } from "@/lib/playerIdentity";
import { clubNationalLeagues, resolvePlayerCountry, resolvePlayerLeague } from "@/lib/playerSnapshot";
import { PUBLIC_MATCH_FIELDS, PUBLIC_MATCH_PLAYER_STATS_FIELDS, PUBLIC_PLAYER_FIELDS, loadMatchesByIds, loadMembershipsForPlayers, loadPlayerStatsForPlayers } from "@/lib/publicFootballData";
import { careerSummary, resolveCurrentClubId } from "@/lib/playerCareer";

const isBelgian = (value) => String(value || "").trim().toLocaleLowerCase("fr").startsWith("belg");
const isBelgianClub = (club) => isBelgian(club?.ext?.country) || isBelgian(club?.ext?.team?.country);

export async function loadAbroadFormData(db, { includeUpcoming = false } = {}) {
    const [playerResult, competitionResult] = await Promise.all([
      db.from("players").select(`${PUBLIC_PLAYER_FIELDS},binational_watch:ext->binational_watch,birth:ext->birth,league_stats:ext->league_stats`).eq("tracked", true).eq("active", true),
      db.from("competitions").select("*"),
    ]);
    if (playerResult.error) throw playerResult.error;
    if (competitionResult.error) throw competitionResult.error;
    // Charger les sélections avant de filtrer : une sélection belge est aussi
    // un lien valide lorsque le fournisseur ne renvoie qu'une autre nationalité.
    const nationalIds = [...new Set((playerResult.data || []).map((player) => player.national_team_id).filter(Boolean))];
    const nationalTeams = {};
    for (let i = 0; i < nationalIds.length; i += 400) {
      const result = await db.from("clubs").select("id,name,team_type,ext").in("id", nationalIds.slice(i, i + 400));
      if (result.error) throw result.error;
      for (const team of result.data || []) nationalTeams[team.id] = team;
    }
    const players = (playerResult.data || []).filter((player) => isBelgianFollowed(player, nationalTeams[player.national_team_id]));
    const playerIds = players.map((player) => player.id);
    const [statsRows, performanceResult, membershipRows] = await Promise.all([
      // Saison en cours et précédente (championnat d'un club), plus les 5 saisons passées.
      loadPlayerStatsForPlayers(db, playerIds, { sinceSeason: currentSeasonStart() - 1 }),
      loadAbroadPerformances(db, playerIds, PUBLIC_MATCH_PLAYER_STATS_FIELDS),
      // Parcours en club : arrivée au club actuel et clubs précédents sur chaque carte.
      loadMembershipsForPlayers(db, playerIds),
    ]);
    // Clubs des affectations actives inclus : le club actuel peut différer de club_id (transfert).
    const followedTeamIds = [...new Set([...players.flatMap((player) => [player.club_id, player.national_team_id]), ...membershipRows.filter((row) => row.active).map((row) => row.club_id)].filter(Boolean))];
    const [upcomingResult, performanceMatches] = await Promise.all([
      includeUpcoming && followedTeamIds.length ? db.from("matches").select(PUBLIC_MATCH_FIELDS).or(`home_club_id.in.(${followedTeamIds.join(",")}),away_club_id.in.(${followedTeamIds.join(",")})`).neq("status", "finished").gte("kickoff", new Date().toISOString()).order("kickoff", { ascending: true }).limit(100) : Promise.resolve({ data: [] }),
      loadMatchesByIds(db, (performanceResult.data || []).map((row) => row.match_id)),
    ]);
    if (upcomingResult.error) throw upcomingResult.error;
    const matchMap = new Map([...(upcomingResult.data || []), ...performanceMatches].map((match) => [match.id, match]));
    // Charger UNIQUEMENT les clubs référencés (joueurs + sélections + adversaires des
    // matchs + clubs des stats), par paquets → fini les « Club à renseigner » dus au
    // plafond de 1000 clubs, et ça reste rapide quel que soit le total en base.
    const clubIdSet = new Set(followedTeamIds);
    for (const match of matchMap.values()) { if (match.home_club_id) clubIdSet.add(match.home_club_id); if (match.away_club_id) clubIdSet.add(match.away_club_id); }
    for (const row of [...statsRows, ...membershipRows]) { if (row.club_id) clubIdSet.add(row.club_id); }
    const clubList = [];
    const clubIdArr = [...clubIdSet].filter(Boolean);
    for (let i = 0; i < clubIdArr.length; i += 400) {
      const { data, error } = await db.from("clubs").select("id,name,logo_url,team_type,ext").in("id", clubIdArr.slice(i, i + 400));
      if (error) throw error;
      if (data) clubList.push(...data);
    }
    const stats = {};
    for (const row of statsRows) (stats[row.player_id] ||= []).push(row);
    const memberships = {};
    for (const row of membershipRows) (memberships[row.player_id] ||= []).push(row);
    return {
      players,
      clubs: Object.fromEntries(clubList.map((item) => [item.id, item])),
      competitions: Object.fromEntries((competitionResult.data || []).map((item) => [item.id, item])),
      stats,
      memberships,
      matches: [...matchMap.values()],
      performances: performanceResult.data || [],
      performancesLimited: performanceResult.limited,
      loading: false,
      error: "",
    };
}

export function buildAbroadForm(data) {
    // Championnat national connu de chaque club, d'après toutes les lignes chargées.
    const clubLeagues = clubNationalLeagues(Object.values(data.stats).flat(), data.competitions);
    const enriched = data.players.map((player) => {
      // Club actuel d'après les affectations, comme la fiche joueur : club_id est
      // réécrit par le balayage avec le club de la ligue scannée (M. Godts affiché
      // à l'Ajax après son transfert au PSG, 28/10/2026).
      const currentClubId = resolveCurrentClubId({ player, memberships: data.memberships[player.id] || [], clubsById: data.clubs }) || player.club_id;
      const club = data.clubs[currentClubId];
      // Instantané (championnat, pays) écrit pour l'ancien club : écarté après un transfert.
      const current = currentClubId === player.club_id ? player : { ...player, club_id: currentClubId, competition: null, country: null };
      // La fiche étrangère reste un bilan de club : les lignes de sélection
      // appartiennent au parcours international de la fiche joueur.
      const playerStats = (data.stats[player.id] || []).filter((row) => !isNationalSelectionClub(data.clubs[row.club_id], player.nationality));
      const domesticBelgianClub = playerStats.some((row) => row.club_id === currentClubId && isBelgian(data.competitions[row.competition_id]?.ext?.country));
      // Championnat et pays : statistiques du club actuel, puis championnat du club,
      // puis instantané s'il est valide — jamais « World » ni une coupe d'Europe.
      const league = resolvePlayerLeague({ player: current, statRows: playerStats, competitionsById: data.competitions, clubLeagues, club });
      const resolvedCountry = resolvePlayerCountry({ player: current, club, league: league.competition }) || UNKNOWN_COUNTRY;
      const resolvedCompetition = league.name || UNKNOWN_COMPETITION;
      return { player, club, nationalTeam: data.clubs[player.national_team_id], watch: belgianWatchStatus(player, data.clubs[player.national_team_id]), country: resolvedCountry, competition: resolvedCompetition, competitionData: league.competition, totals: seasonTotals(playerStats, player.league_stats), career: careerSummary(data.memberships[player.id] || [], currentClubId, data.clubs, { nationality: player.nationality }), domesticBelgianClub };
    }).filter((item) => item.club && item.club.team_type !== "national" && !item.domesticBelgianClub && !isBelgianClub(item.club) && !isBelgian(item.country));
    const playerMap = Object.fromEntries(enriched.map((item) => [item.player.id, item]));
    const matchMap = Object.fromEntries(data.matches.map((match) => [match.id, match]));
    const performances = data.performances.map((performance) => ({ performance, item: playerMap[performance.player_id], match: matchMap[performance.match_id] })).filter((row) => row.item && row.match?.kickoff && Number(row.performance.minutes) > 0 && data.clubs[row.performance.club_id]?.team_type !== "national").sort((a, b) => new Date(b.match.kickoff) - new Date(a.match.kickoff));
    const byPlayer = {};
    for (const row of performances) if (isRecentPerformance(row.match) && (byPlayer[row.item.player.id] ||= []).length < 5) byPlayer[row.item.player.id].push(row);
    const allForm = enriched.map((item) => {
      const recent = byPlayer[item.player.id] || [];
      const goals = recent.reduce((sum, row) => sum + (Number(row.performance.goals) || 0), 0);
      const assists = recent.reduce((sum, row) => sum + (Number(row.performance.assists) || 0), 0);
      const ratings = recent.map((row) => Number(row.performance.rating)).filter((value) => value > 0);
      const rating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : recent.length ? null : item.totals.rating;
      return { ...item, recent, ratings, recentCount: recent.length, goals: recent.length ? goals : item.totals.goals, assists: recent.length ? assists : item.totals.assists, rating, score: goals * 4 + assists * 3 + (rating || 0) + (recent.length ? recent.length : item.totals.appearances / 10) };
    }).sort((a, b) => b.score - a.score || a.player.name.localeCompare(b.player.name, "fr"));
    const form = allForm.filter((item) => item.recentCount > 0 && isRecentPerformance(item.recent[0]?.match));
    return { enriched, performances, allForm, form };
}
