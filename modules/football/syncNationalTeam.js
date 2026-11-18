import { getProvider } from "./providers";
import { upsertExternal, ensureCompetitions } from "./sync";
import { ensureSeason, seasonLabel, seasonYear } from "./season";
import { frenchNationName } from "@/lib/frenchNations";
import { resolveNationalMatchSeason } from "./nationalMatchSeasons";
import { nationalTeamTraits } from "./nationalClassification";
import { providerIdentityPatch } from "@/lib/playerIdentity";
import { readAll } from "@/lib/readAll";
import { applyApiCallups, atomicCallupsAvailable } from "@/modules/football/callupTransactions";

// Seulement le nom et la photo : la nationalité suit ici sa propre règle (sélection).
function nameAndPhoto(existing, member) {
  const { name, photo_url } = providerIdentityPatch(existing, { name: member.name, photo_url: member.photo_url });
  return { ...(name !== undefined ? { name } : {}), ...(photo_url !== undefined ? { photo_url } : {}) };
}

const ALLOWED_CATEGORIES = new Set(["senior", "u23", "u21", "u20", "u19", "u18", "u17", "u16", "u15", "women"]);
const GENDERS = new Set(["men", "women"]);

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

// Catégorie (âge) et genre de la sélection synchronisée, DISTINCTS :
// - genre : choix explicite (admin, cron), sinon nom API (« Belgium U19 W »),
//   sinon catégorie historique « women » ; jamais déduit de l'âge seul ;
// - l'équipe A féminine reste stockée « women » (représentation existante des
//   Red Flames) ; une sélection féminine de jeunes garde son âge (« u19 » + women).
export function nationalIdentity({ nationalCategory, nationalGender, teamName } = {}) {
  let category = normalizeCategory(nationalCategory);
  const explicit = String(nationalGender || "").trim().toLowerCase();
  const gender = GENDERS.has(explicit) ? explicit
    : nationalTeamTraits(teamName).gender === "women" ? "women"
      : category === "women" ? "women" : "men";
  if (gender === "women" && category === "senior") category = "women";
  if (gender === "men" && category === "women") category = "senior";
  return { category, gender };
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
  const selectedSeason = seasonLabel(ctx.season);
  const season = seasonYear(selectedSeason);
  const syncedAt = new Date().toISOString();

  const [team, matches, squad] = await Promise.all([
    provider.fetchClubById(teamExternalId, { ...ctx, season }),
    provider.fetchNationalTeamMatches(teamExternalId, { ...ctx, season }),
    provider.fetchCurrentSquad({ external_id: teamExternalId }, { ...ctx, season }),
  ]);
  if (!team) throw new Error(`Sélection ${teamExternalId} introuvable`);
  const { category, gender } = nationalIdentity({ nationalCategory: ctx.nationalCategory, nationalGender: ctx.nationalGender, teamName: team.name });

  // Compétitions résolues AVANT toute écriture : une collision (slug ou
  // identifiant ambigu) arrête la synchronisation sans toucher aux clubs,
  // aux matchs ni aux convocations.
  const competitionMap = await ensureInternationalCompetitions(db, providerKey, matches);

  await upsertExternal(db, "clubs", providerKey, [{ ...team, name: frenchNationName(team.name), team_type: "national", national_category: category, national_gender: gender, national_followed: true }], [
    "name", "short_name", "logo_url", "city", "founded_year", "stadium_name", "stadium_capacity", "stadium_address", "stadium_image_url", "team_type", "national_category", "national_gender", "national_followed",
  ], { extMode: "merge" });

  const opponents = new Map();
  for (const match of matches) {
    if (match.home_ext && match.home_ext !== teamExternalId) opponents.set(match.home_ext, { external_id: match.home_ext, name: frenchNationName(match.home_name) || match.home_ext, logo_url: match.home_logo || null, team_type: "national", national_category: category, national_gender: gender, national_followed: false });
    if (match.away_ext && match.away_ext !== teamExternalId) opponents.set(match.away_ext, { external_id: match.away_ext, name: frenchNationName(match.away_name) || match.away_ext, logo_url: match.away_logo || null, team_type: "national", national_category: category, national_gender: gender, national_followed: false });
  }
  await upsertExternal(db, "clubs", providerKey, [...opponents.values()], ["name", "logo_url", "team_type", "national_category", "national_gender", "national_followed"], { extMode: "keep" });

  const externalClubIds = [...opponents.keys()];
  if (!externalClubIds.includes(teamExternalId)) externalClubIds.push(teamExternalId);
  const { data: clubRows, error: clubsError } = await db.from("clubs").select("id,external_id").eq("source", providerKey).in("external_id", externalClubIds);
  if (clubsError) throw clubsError;
  const clubMap = new Map((clubRows || []).map((row) => [String(row.external_id), row.id]));
  const nationalTeamId = clubMap.get(teamExternalId);
  if (!nationalTeamId) throw new Error(`${team.name}: sélection importée mais identifiant local introuvable`);

  // Matchs déjà en base parmi ceux reçus, avec leur verrou. Un match verrouillé
  // n'est jamais modifié (upsertExternal l'ignore) : il ne crée donc aucune
  // saison et n'entre dans aucun compteur. Un match absent est « nouveau ».
  const knownMatches = new Map();
  const incomingIds = [...new Set(matches.filter((match) => competitionMap.has(match.league_ext)).map((match) => String(match.external_id)).filter(Boolean))];
  for (let index = 0; index < incomingIds.length; index += 75) {
    const { data: knownRows, error: knownError } = await db.from("matches").select("external_id,locked").eq("source", providerKey).in("external_id", incomingIds.slice(index, index + 75));
    if (knownError) throw knownError;
    for (const row of knownRows || []) knownMatches.set(String(row.external_id), row);
  }

  // Saison de CHAQUE match = saison fournie par l'API pour ce match (jamais la
  // saison demandée par le cron : les derniers/prochains matchs couvrent
  // plusieurs campagnes). Seules les saisons réellement rencontrées sont créées.
  const matchSeasons = new Map();
  const seasonIds = new Map();
  const seasonCounts = new Map();
  const unusualSeasons = [];
  const withoutSeason = [];
  let lockedIgnored = 0;
  for (const match of matches) {
    const competitionId = competitionMap.get(match.league_ext);
    if (!competitionId) continue;
    if (knownMatches.get(String(match.external_id))?.locked) { lockedIgnored++; continue; }
    const resolved = resolveNationalMatchSeason(match);
    matchSeasons.set(match.external_id, resolved);
    if (!resolved.label) { withoutSeason.push(match); continue; }
    seasonCounts.set(resolved.label, (seasonCounts.get(resolved.label) || 0) + 1);
    if (resolved.unusual) unusualSeasons.push(`${match.home_name || "?"}–${match.away_name || "?"} du ${String(match.kickoff || "").slice(0, 10) || "?"} : saison API ${resolved.year}`);
    const key = `${competitionId}:${resolved.label}`;
    if (!seasonIds.has(key)) seasonIds.set(key, (await ensureSeason(db, competitionId, resolved.label)).id);
  }

  // Sans saison API exploitable : un match existant garde sa saison actuelle
  // (season_id omis du patch) ; un nouveau match est inséré sans saison et signalé.
  const newWithoutSeason = withoutSeason.filter((match) => !knownMatches.has(String(match.external_id)));

  const resolvedMatches = matches.flatMap((match) => {
    const competitionId = competitionMap.get(match.league_ext);
    if (!competitionId) return [];
    if (knownMatches.get(String(match.external_id))?.locked) return [];
    const round = parseRound(match.round);
    const seasonLabelForMatch = matchSeasons.get(match.external_id)?.label;
    const seasonId = seasonLabelForMatch ? seasonIds.get(`${competitionId}:${seasonLabelForMatch}`) : null;
    return [{
      external_id: match.external_id,
      competition_id: competitionId,
      ...(seasonId ? { season_id: seasonId } : {}),
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

  // Préserver les anciennes lignes tant que l'ensemble du nouvel effectif
  // n'a pas été enregistré. Une réponse vide n'est pas une liste officielle vide.
  const atomicCallups = squad.length ? await atomicCallupsAvailable(db) : false;
  const atomicPeople = [];
  let atomicResult = null;
  const { data: existingCallups, error: callupsError } = squad.length && !atomicCallups
    ? await readAll(() => db.from("national_team_callups").select("id,player_id,season,source,locked,active").eq("national_team_id", nationalTeamId))
    : { data: [], error: null };
  if (callupsError) throw callupsError;
  const callupByPlayerSeason = new Map((existingCallups || []).map((row) => [`${row.player_id}:${row.season}`, row]));
  const retainedIds = new Set();

  let callups = 0;
  for (const member of squad) {
    const { data: existing, error: playerSelectError } = await db.from("players").select("id,locked,club_id,country,tracked,nationality,national_team_id,national_team_locked,ext").eq("source", providerKey).eq("external_id", member.external_id).maybeSingle();
    if (playerSelectError) throw playerSelectError;
    const playerPatch = {
      source: providerKey,
      external_id: member.external_id,
      // Nom et photo corrigés à la main protégés (lib/playerIdentity.js).
      ...nameAndPhoto(existing, member),
      nationality: existing?.nationality || "Belgium",
      ...(category === "senior" && !existing?.national_team_locked ? { national_team_id: nationalTeamId } : {}),
      position: member.position,
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
    if (atomicCallups) {
      atomicPeople.push({ playerId, externalId: member.external_id, number: member.number ?? null, position: member.position ?? null, ext: member.ext || member });
      callups++;
      continue;
    }
    const callupKey = `${playerId}:${selectedSeason}`;
    const currentCallup = callupByPlayerSeason.get(callupKey);
    if (currentCallup?.locked || (currentCallup && currentCallup.source !== providerKey)) {
      retainedIds.add(currentCallup.id);
      callups++;
      continue;
    }
    const callupPatch = {
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
    };
    const query = currentCallup
      ? db.from("national_team_callups").update(callupPatch).eq("id", currentCallup.id).eq("locked", false).eq("source", providerKey)
      : db.from("national_team_callups").insert({ ...callupPatch, locked: false });
    const { data: savedCallup, error: callupError } = await query.select("id").maybeSingle();
    if (callupError) throw new Error(`${member.name}: ${callupError.message}`);
    if (!savedCallup?.id) throw new Error(`${member.name}: convocation modifiée pendant la synchronisation`);
    retainedIds.add(savedCallup.id);
    callupByPlayerSeason.set(callupKey, { id: savedCallup.id, player_id: playerId, season: selectedSeason, source: providerKey, locked: false });
    callups++;
  }

  if (atomicCallups) atomicResult = await applyApiCallups(db, nationalTeamId, selectedSeason, atomicPeople);
  const staleIds = (existingCallups || []).filter((row) => row.active && row.source === providerKey && !row.locked && !retainedIds.has(row.id)).map((row) => row.id);
  for (let offset = 0; offset < staleIds.length; offset += 400) {
    const { error } = await db.from("national_team_callups").update({ active: false, updated_at: syncedAt })
      .in("id", staleIds.slice(offset, offset + 400)).eq("national_team_id", nationalTeamId).eq("source", providerKey).eq("locked", false);
    if (error) throw error;
  }

  const competitionNames = [...new Set(matches.map((match) => match.league_name).filter(Boolean))];
  const listPreview = (items) => items.slice(0, 5).join(" ; ") + (items.length > 5 ? ` ; +${items.length - 5}` : "");
  const seasonSummary = [...seasonCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => `${label} ×${count}`).join(", ");
  const notes = [`saisons API : ${seasonSummary || "aucune"}`];
  if (atomicResult?.skipped) notes.push("convocations API ignorées : liste RBFA prioritaire");
  if (!squad.length) notes.push("avertissement : effectif API vide, convocations précédentes conservées");
  const existingWithoutSeason = withoutSeason.length - newWithoutSeason.length;
  if (existingWithoutSeason) notes.push(`avertissement : ${existingWithoutSeason} match(s) existant(s) sans saison API exploitable : saison actuelle conservée`);
  if (newWithoutSeason.length) notes.push(`avertissement : ${newWithoutSeason.length} nouveau(x) match(s) inséré(s) sans saison : ${listPreview(newWithoutSeason.map((match) => `${match.home_name || "?"}–${match.away_name || "?"} du ${String(match.kickoff || "").slice(0, 10) || "?"}`))}`);
  if (unusualSeasons.length) notes.push(`avertissement : ${unusualSeasons.length} saison(s) API inhabituelle(s), conservée(s) : ${listPreview(unusualSeasons)}`);
  if (lockedIgnored) notes.push(`matchs verrouillés ignorés : ${lockedIgnored}`);
  return `${team.name} (${category.toUpperCase()}) : ${resolvedMatches.length} matchs, ${competitionMap.size} compétitions (${competitionNames.join(", ") || "aucune"}) et ${callups} joueurs (${season}) · ${notes.join(" · ")}`;
}

