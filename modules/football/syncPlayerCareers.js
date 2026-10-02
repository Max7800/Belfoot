import { getProvider } from "./providers";
import { upsertExternal, ensureCompetitions } from "./sync";
import { squadRoleForClub, upsertPlayerMembership } from "./playerMemberships";
import { isNationalSelectionClub } from "@/lib/nationalities";

function inferredTeamType(name, national = false) {
  if (national) return "national";
  const value = String(name || "").toLowerCase();
  if (/\b(u23|jong|futures|nxt|reserve|réserve)\b/.test(value)) return "u23";
  if (/\b(u\d{2}|youth|academy|jeunes?)\b/.test(value)) return "youth";
  if (/\b(women|féminin|feminin|dames)\b/.test(value)) return "women";
  return "first_team";
}

async function ensureExternalReferences(db, table, source, rows) {
  const uniqueRows = [...new Map((rows || []).filter((row) => row.external_id).map((row) => [String(row.external_id), row])).values()];
  if (!uniqueRows.length) return;
  const { data: existing, error: existingError } = await db.from(table).select("external_id").eq("source", source).in("external_id", uniqueRows.map((row) => String(row.external_id)));
  if (existingError) throw existingError;
  const known = new Set((existing || []).map((row) => String(row.external_id)));
  const missing = uniqueRows.filter((row) => !known.has(String(row.external_id))).map((row) => ({ ...row, source }));
  if (missing.length) {
    const { error } = await db.from(table).insert(missing);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function syncPlayerCareers(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchPlayerCareer) throw new Error(`${competition.name}: historiques de carrière non supportés`);
  const targeted = !!ctx.playerId;
  const batchSize = targeted ? 1 : Math.max(1, Math.min(Number(ctx.batchSize) || 5, 25));
  let playersQuery = db.from("players")
    .select("id,name,external_id,source,nationality,career_sync_status,career_synced_at,ext")
    .eq("source", competition.provider)
    .not("external_id", "is", null);
  if (targeted) {
    playersQuery = playersQuery.eq("id", ctx.playerId);
  } else {
    const { data: matches, error: matchesError } = await db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
    if (matchesError) throw matchesError;
    const clubIds = [...new Set((matches || []).flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
    if (!clubIds.length) return `${competition.name}: aucun club rattaché`;
    playersQuery = playersQuery.eq("tracked", true).eq("active", true).in("club_id", clubIds);
  }
  const { data: players, error: playersError } = await playersQuery
    .order("career_synced_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true })
    .limit(batchSize);
  if (playersError) throw playersError;
  if (!players?.length) return targeted ? `${competition.name}: joueur introuvable ou sans identifiant provider` : `${competition.name}: aucun joueur suivi à traiter`;

  let memberships = 0;
  let statLines = 0;
  const errors = [];
  for (const player of players) {
    await db.from("players").update({ career_sync_status: "running" }).eq("id", player.id);
    try {
      const history = await provider.fetchPlayerCareer(player, ctx);
      await ensureExternalReferences(db, "clubs", competition.provider, history.map((row) => ({
        external_id: row.team.external_id,
        name: row.team.name,
        logo_url: row.team.logo_url,
        team_type: inferredTeamType(row.team.name, row.team.national),
        ext: row.ext || {},
      })));
      const externalIds = [...new Set(history.map((row) => row.team.external_id))];
      const { data: clubs, error: clubsError } = externalIds.length
        ? await db.from("clubs").select("id,name,external_id,team_type,national_category,ext").eq("source", competition.provider).in("external_id", externalIds)
        : { data: [], error: null };
      if (clubsError) throw clubsError;
      const clubMap = Object.fromEntries((clubs || []).map((club) => [club.external_id, club]));
      for (const row of history) {
        const club = clubMap[row.team.external_id];
        if (!club || isNationalSelectionClub(club, player.nationality)) continue;
        await upsertPlayerMembership(db, {
          playerId: player.id,
          club,
          season: row.season,
          source: competition.provider,
          externalId: player.external_id,
          squadRole: squadRoleForClub(club),
          isPrimary: club.team_type === "first_team",
          active: false,
          ext: row.ext,
        });
        memberships++;
      }
      if (ctx.includeCareerStats && provider.fetchPlayerCareerSeason) {
        const seasonStats = await provider.fetchPlayerCareerSeason(player, ctx);
        await ensureExternalReferences(db, "clubs", competition.provider, seasonStats.map((row) => ({
          external_id: row.team.external_id,
          name: row.team.name,
          logo_url: row.team.logo_url,
          team_type: inferredTeamType(row.team.name, row.team.national),
          national_category: row.team.national ? (/\bU\s?(\d{2})\b/i.exec(row.team.name)?.[1] ? `u${/\bU\s?(\d{2})\b/i.exec(row.team.name)[1]}` : "senior") : null,
          ext: { country: row.team.country, national: row.team.national, imported_for: "player-career" },
        })));
        const compMap = await ensureCompetitions(db, competition.provider, seasonStats.map((row) => ({
          external_id: row.competition.external_id,
          name: row.competition.name,
          logo_url: row.competition.logo_url,
          competition_type: row.competition.type,
          ext: { country: row.competition.country, country_flag: row.competition.flag_url, imported_for: "player-career" },
        })));

        const teamExternalIds = [...new Set(seasonStats.map((row) => row.team.external_id))];
        const { data: statClubs, error: statClubsError } = teamExternalIds.length
          ? await db.from("clubs").select("id,name,external_id,team_type,national_category,ext").eq("source", competition.provider).in("external_id", teamExternalIds)
          : { data: [] };
        if (statClubsError) throw statClubsError;
        const statClubMap = Object.fromEntries((statClubs || []).map((club) => [String(club.external_id), club]));
        const statCompetitions = [...compMap.values()];
        const statCompetitionMap = Object.fromEntries(statCompetitions.map((item) => [String(item.external_id), item]));
        const seasonYear = String(seasonStats[0]?.season || String(ctx.season || "").match(/\d{4}/)?.[0] || "");
        const seasonLabel = seasonYear ? `${seasonYear}-${Number(seasonYear) + 1}` : String(ctx.season || "");
        const statCompetitionIds = (statCompetitions || []).map((item) => item.id);
        const { data: existingSeasons, error: existingSeasonsError } = statCompetitionIds.length
          ? await db.from("seasons").select("id,competition_id").in("competition_id", statCompetitionIds).eq("label", seasonLabel)
          : { data: [], error: null };
        if (existingSeasonsError) throw existingSeasonsError;
        const competitionsWithSeason = new Set((existingSeasons || []).map((row) => row.competition_id));
        const seasonRows = (statCompetitions || []).filter((item) => !competitionsWithSeason.has(item.id)).map((item) => ({
          external_id: `${item.external_id}:${seasonYear}`,
          competition_id: item.id,
          label: seasonLabel,
        }));
        await upsertExternal(db, "seasons", competition.provider, seasonRows, ["competition_id", "label"]);
        const { data: storedSeasons, error: storedSeasonsError } = statCompetitionIds.length
          ? await db.from("seasons").select("id,competition_id").in("competition_id", statCompetitionIds).eq("label", seasonLabel)
          : { data: [], error: null };
        if (storedSeasonsError) throw storedSeasonsError;
        const storedSeasonMap = Object.fromEntries((storedSeasons || []).map((row) => [row.competition_id, row.id]));
        const { data: existingStats, error: existingStatsError } = await db.from("player_season_stats")
          .select("id,club_id,competition_id,locked")
          .eq("player_id", player.id)
          .eq("season", seasonYear);
        if (existingStatsError) throw existingStatsError;
        const existingStatsMap = new Map((existingStats || []).map((row) => [`${row.club_id}:${row.competition_id}`, row]));
        const now = new Date().toISOString();
        for (const row of seasonStats) {
          const club = statClubMap[row.team.external_id];
          const statCompetition = statCompetitionMap[row.competition.external_id];
          if (!club || !statCompetition) continue;
          if (!isNationalSelectionClub(club, row.player.nationality || player.nationality)) {
            await upsertPlayerMembership(db, {
              playerId: player.id,
              club,
              season: seasonLabel,
              source: competition.provider,
              externalId: player.external_id,
              position: row.player.position,
              squadRole: squadRoleForClub(club),
              isPrimary: club.team_type === "first_team",
              active: false,
              ext: { imported_for: "player-career-stats" },
            });
          }
          const existingStat = existingStatsMap.get(`${club.id}:${statCompetition.id}`);
          if (existingStat?.locked) continue;
          const statsPatch = {
            player_id: player.id,
            club_id: club.id,
            competition_id: statCompetition.id,
            season_id: storedSeasonMap[statCompetition.id] || null,
            season: row.season,
            ...row.stats,
            source: competition.provider,
            external_id: player.external_id,
            ext: row.ext || {},
            synced_at: now,
          };
          const { error: statsError } = existingStat
            ? await db.from("player_season_stats").update(statsPatch).eq("id", existingStat.id)
            : await db.from("player_season_stats").insert(statsPatch);
          if (statsError) throw new Error(`${player.name}: statistiques ${row.competition.name}: ${statsError.message}`);
          statLines++;
        }
      }
      const completedAt = new Date().toISOString();
      const seasonKey = String(ctx.season || "").match(/\d{4}/)?.[0];
      const completedExt = ctx.includeCareerStats && seasonKey
        ? { ...(player.ext || {}), career_stats_seasons: { ...(player.ext?.career_stats_seasons || {}), [seasonKey]: completedAt } }
        : player.ext;
      await db.from("players").update({ career_sync_status: "ok", career_synced_at: completedAt, ...(completedExt ? { ext: completedExt } : {}) }).eq("id", player.id);
    } catch (error) {
      await db.from("players").update({ career_sync_status: "error", career_synced_at: new Date().toISOString() }).eq("id", player.id);
      errors.push(`${player.name}: ${error.message || String(error)}`);
    }
  }
  if (targeted && errors.length) throw new Error(errors.join("; "));
  const detail = `${competition.name}: ${players.length} carrière(s), ${memberships} affectation(s) historiques${ctx.includeCareerStats ? ` · ${statLines} ligne(s) statistique(s) toutes compétitions` : ""}${errors.length ? ` · ${errors.length} erreur(s): ${errors.join("; ")}` : ""}`;
  if (targeted) return detail;
  // Lot : on signale l'avancement pour qu'un pipeline draine tous les joueurs de la
  // division (terminé quand plus aucun joueur n'a d'historique manquant).
  const { count: remaining } = await db.from("players").select("id", { count: "exact", head: true })
    .eq("tracked", true).eq("active", true).in("club_id", clubIds).is("career_synced_at", null);
  const left = remaining || 0;
  return {
    detail: `${detail}${left ? ` · ${left} joueur(s) restant(s)` : " · division à jour"}`,
    complete: left === 0,
    progress: { current: players.length, total: left + players.length, unit: "joueurs" },
  };
}
