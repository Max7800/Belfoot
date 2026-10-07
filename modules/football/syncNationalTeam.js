import { getProvider } from "./providers";
import { upsertExternal, ensureCompetitions } from "./sync";
import { ensureSeason, seasonLabel, seasonYear } from "./season";
import { frenchNationName } from "@/lib/frenchNations";

const ALLOWED_CATEGORIES = new Set(["senior", "u23", "u21", "u20", "u19", "u18", "u17", "women"]);

function parseRound(raw) {
  if (!raw) return { round_raw: null, phase: null, round_number: null };
  const value = String(raw).trim();
  const parts = value.split(" - ");
  const last = parts.at(-1)?.trim();
  if (parts.length >= 2 && /^\d+$/.test(last)) return { round_raw: value, phase: parts.slice(0, -1).join(" - ").trim(), round_number: Number(last) };
  return { round_raw: value, phase: value, round_number: null };
}

function normalizeCategory(value) {
  const category = String(value || "senior").trim().toLowerCase();
  return ALLOWED_CATEGORIES.has(category) ? category : "senior";
}

async function ensureInternationalCompetitions(db, providerKey, matches) {
  const definitions = new Map();
  for (const match of matches) {
    if (!match.league_ext) continue;
    definitions.set(match.league_ext, {
      external_id: match.league_ext,
      name: match.league_name || `Compétition internationale ${match.league_ext}`,
      logo_url: match.league_logo || null,
      ext: { country: match.league_country || "World", country_flag: match.league_flag || null, imported_for: "national-teams" },
    });
  }
  if (!definitions.size) return new Map();
  // Chemin unique et sûr : réutilise la compétition existante (par provider+external_id)
  // au lieu d'en créer un doublon → ne viole jamais l'index unique.
  const byExt = await ensureCompetitions(db, providerKey, [...definitions.values()].map((d) => ({
    external_id: d.external_id,
    name: d.name,
    slug: `international-${d.external_id}`,
    logo_url: d.logo_url,
    competition_type: "cup",
    competition_scope: "international",
    ext: d.ext,
  })));
  return new Map([...byExt.entries()].map(([externalId, row]) => [externalId, row.id]));
}

export async function syncNationalTeam(db, ctx = {}) {
  const providerKey = "apifootball";
  const provider = getProvider(providerKey);
  if (!provider?.fetchClubById || !provider?.fetchNationalTeamMatches || !provider?.fetchCurrentSquad) {
    throw new Error("Le provider API-Football ne prend pas en charge les sélections");
  }
  const teamExternalId = String(ctx.teamExternalId || "").trim();
  if (!teamExternalId) throw new Error("Renseigne l’ID API-Football de la sélection");
  const category = normalizeCategory(ctx.nationalCategory);
  const gender = category === "women" ? "women" : "men";
  const selectedSeason = seasonLabel(ctx.season);
  const season = seasonYear(selectedSeason);
  const syncedAt = new Date().toISOString();

  const [team, matches, squad] = await Promise.all([
    provider.fetchClubById(teamExternalId, { ...ctx, season }),
    provider.fetchNationalTeamMatches(teamExternalId, { ...ctx, season }),
    provider.fetchCurrentSquad({ external_id: teamExternalId }, { ...ctx, season }),
  ]);
  if (!team) throw new Error(`Sélection ${teamExternalId} introuvable`);

  await upsertExternal(db, "clubs", providerKey, [{ ...team, name: frenchNationName(team.name), team_type: "national", national_category: category, national_gender: gender, national_followed: true }], [
    "name", "short_name", "logo_url", "city", "founded_year", "stadium_name", "stadium_capacity", "stadium_address", "stadium_image_url", "team_type", "national_category", "national_gender", "national_followed",
  ]);

  const opponents = new Map();
  for (const match of matches) {
    if (match.home_ext && match.home_ext !== teamExternalId) opponents.set(match.home_ext, { external_id: match.home_ext, name: frenchNationName(match.home_name) || match.home_ext, logo_url: match.home_logo || null, team_type: "national", national_category: category, national_gender: gender, national_followed: false });
    if (match.away_ext && match.away_ext !== teamExternalId) opponents.set(match.away_ext, { external_id: match.away_ext, name: frenchNationName(match.away_name) || match.away_ext, logo_url: match.away_logo || null, team_type: "national", national_category: category, national_gender: gender, national_followed: false });
  }
  await upsertExternal(db, "clubs", providerKey, [...opponents.values()], ["name", "logo_url", "team_type", "national_category", "national_gender", "national_followed"]);

  const externalClubIds = [...opponents.keys()];
  if (!externalClubIds.includes(teamExternalId)) externalClubIds.push(teamExternalId);
  const { data: clubRows, error: clubsError } = await db.from("clubs").select("id,external_id").eq("source", providerKey).in("external_id", externalClubIds);
  if (clubsError) throw clubsError;
  const clubMap = new Map((clubRows || []).map((row) => [String(row.external_id), row.id]));
  const nationalTeamId = clubMap.get(teamExternalId);
  if (!nationalTeamId) throw new Error(`${team.name}: sélection importée mais identifiant local introuvable`);

  const competitionMap = await ensureInternationalCompetitions(db, providerKey, matches);
  const seasonMap = new Map();
  for (const competitionId of new Set(competitionMap.values())) {
    const row = await ensureSeason(db, competitionId, selectedSeason);
    seasonMap.set(competitionId, row.id);
  }

  const resolvedMatches = matches.flatMap((match) => {
    const competitionId = competitionMap.get(match.league_ext);
    if (!competitionId) return [];
    const round = parseRound(match.round);
    return [{
      external_id: match.external_id,
      competition_id: competitionId,
      season_id: seasonMap.get(competitionId) || null,
      // club_id « collant » : résolu seulement, jamais null (pas d'effacement en resync).
      ...(clubMap.get(match.home_ext) ? { home_club_id: clubMap.get(match.home_ext) } : {}),
      ...(clubMap.get(match.away_ext) ? { away_club_id: clubMap.get(match.away_ext) } : {}),
      home_score: match.home_score,
      away_score: match.away_score,
      status: match.status,
      minute: match.minute ?? null,
      kickoff: match.kickoff,
      matchday: round.round_number,
      round_raw: round.round_raw,
      phase: round.phase,
      round_number: round.round_number,
      provider: providerKey,
      ext: match,
    }];
  });
  await upsertExternal(db, "matches", providerKey, resolvedMatches, ["competition_id", "season_id", "home_club_id", "away_club_id", "home_score", "away_score", "status", "minute", "kickoff", "matchday", "round_raw", "phase", "round_number", "provider"]);

  // Désactive TOUTES les convocations de la sélection (toutes saisons confondues) avant de
  // réactiver l'effectif actuel. L'affichage lit les convocations actives sans filtre de
  // saison : sans ça, un joueur convoqué une saison passée (ex. parti dans une autre
  // sélection) resterait « actif » à vie. L'historique est conservé (lignes gardées,
  // active=false) ; les convocations verrouillées manuellement ne sont pas touchées.
  const { error: deactivateError } = await db.from("national_team_callups").update({ active: false, updated_at: syncedAt }).eq("national_team_id", nationalTeamId).eq("source", providerKey).eq("locked", false);
  if (deactivateError) throw deactivateError;

  let callups = 0;
  for (const member of squad) {
    const { data: existing, error: playerSelectError } = await db.from("players").select("id,locked,club_id,country,tracked,nationality,national_team_id,national_team_locked").eq("source", providerKey).eq("external_id", member.external_id).maybeSingle();
    if (playerSelectError) throw playerSelectError;
    const playerPatch = {
      source: providerKey,
      external_id: member.external_id,
      name: member.name,
      nationality: existing?.nationality || "Belgium",
      ...(category === "senior" && !existing?.national_team_locked ? { national_team_id: nationalTeamId } : {}),
      position: member.position,
      photo_url: member.photo_url,
      age: member.age,
      active: true,
      tracked: Boolean(existing?.tracked || (existing?.club_id && existing?.country)),
      synced_at: syncedAt,
    };
    let playerId = existing?.id;
    if (!existing) {
      const { data, error } = await db.from("players").insert(playerPatch).select("id").single();
      if (error) throw new Error(`${member.name}: ${error.message}`);
      playerId = data.id;
    } else if (!existing.locked) {
      const { error } = await db.from("players").update(playerPatch).eq("id", existing.id);
      if (error) throw new Error(`${member.name}: ${error.message}`);
    }
    const { error: callupError } = await db.from("national_team_callups").upsert({
      national_team_id: nationalTeamId,
      player_id: playerId,
      season: selectedSeason,
      shirt_number: member.number,
      position: member.position,
      active: true,
      source: providerKey,
      external_id: member.external_id,
      ext: member.ext || member,
      synced_at: syncedAt,
      updated_at: syncedAt,
    }, { onConflict: "national_team_id,player_id,season" });
    if (callupError) throw new Error(`${member.name}: ${callupError.message}`);
    callups++;
  }

  const competitionNames = [...new Set(matches.map((match) => match.league_name).filter(Boolean))];
  return `${team.name} (${category.toUpperCase()}) : ${resolvedMatches.length} matchs, ${competitionMap.size} compétitions (${competitionNames.join(", ") || "aucune"}) et ${callups} joueurs (${season})`;
}
