// « Situation actuelle » d'un joueur : players.club_id, players.country (pays du
// championnat) et players.competition (nom du championnat national).
//
// Ces champs sont un instantané global, partagé par toutes les compétitions. Ils
// ne peuvent donc être écrits que par la synchronisation qui fait autorité : un
// CHAMPIONNAT NATIONAL de la SAISON EN COURS, pour l'équipe principale du joueur.
// Une coupe d'Europe, une coupe nationale, une compétition de sélections ou une
// saison d'archive met à jour les affectations et statistiques (tables séparées),
// jamais cet instantané — sinon un Belge de l'Ajax devient « World ·
// Conférence League » après la synchronisation de la Conference League.

const INTERNATIONAL_COUNTRIES = /^(world|europe|international)$/i;
const INTERNATIONAL_SCOPES = new Set(["europe", "international"]);

const validCountry = (value) => {
  const text = String(value || "").trim();
  return text && !INTERNATIONAL_COUNTRIES.test(text) ? text : null;
};

// Pays du club lui-même (renseigné par /teams). Seul pays fiable pour un club
// engagé dans une compétition internationale.
export function clubCountry(club) {
  return validCountry(club?.ext?.country) || validCountry(club?.ext?.team?.country);
}

// Championnat national : pays réel (jamais « World »), ni coupe, ni format
// hybride UEFA, ni portée européenne/internationale. Le pays « World » est le
// signal le plus fiable : des compétitions mondiales créées par les carrières
// portent parfois la portée « etranger » et le type « league ».
export function isNationalLeague(competition) {
  if (!competition) return false;
  if (!validCountry(competition.ext?.country)) return false;
  if (INTERNATIONAL_SCOPES.has(competition.competition_scope)) return false;
  const providerType = String(competition.ext?.providerType || "").toLowerCase();
  const type = competition.competition_type || (providerType === "cup" ? "cup" : "league");
  return type === "league" && providerType !== "cup";
}

// Saison courante (bascule au 1er juillet, comme syncSquads et les crons).
export function currentSeasonStartYear(now = new Date()) {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export function isCurrentSeason(season, now = new Date()) {
  const year = Number((String(season ?? "").match(/\d{4}/) || [])[0]);
  return Boolean(year) && year === currentSeasonStartYear(now);
}

// Champs d'instantané à écrire pour un joueur vu dans l'effectif `club` d'une
// `competition`. Les champs omis restent inchangés en base.
//   authoritative : championnat national + saison courante + équipe principale
//                   → club, pays et championnat mis à jour ;
//   sinon        : remplit seulement ce qui manque (nouveau joueur, club vide),
//                  répare un pays « World » quand il s'agit bien de son club, et
//                  retire un nom de championnat écrit à tort par CETTE même
//                  compétition non nationale. Rien n'est inventé.
export function playerSnapshotPatch({ existing = null, club, competition, season, primaryClub = true, now = new Date() }) {
  const nationalLeague = isNationalLeague(competition);
  const authoritative = nationalLeague && primaryClub && isCurrentSeason(season, now);
  const ownClubCountry = clubCountry(club);
  const leagueCountry = nationalLeague ? validCountry(competition?.ext?.country) : null;

  if (!existing) {
    return {
      club_id: club?.id || null,
      country: ownClubCountry || leagueCountry,
      competition: nationalLeague ? competition?.name || null : null,
    };
  }

  const patch = {};
  if (authoritative) {
    if (club?.id) patch.club_id = club.id;
    const country = ownClubCountry || leagueCountry;
    if (country) patch.country = country;
    if (competition?.name) patch.competition = competition.name;
    return patch;
  }

  if (!existing.club_id && club?.id) patch.club_id = club.id;
  const sameClub = club?.id && (existing.club_id || patch.club_id) === club.id;
  if (!validCountry(existing.country) && sameClub && ownClubCountry) patch.country = ownClubCountry;
  if (!nationalLeague && competition?.name && existing.competition === competition.name) patch.competition = null;
  return patch;
}

// Championnat national à AFFICHER pour un joueur, à partir des données déjà
// chargées par les pages :
// 1. sa ligne de statistiques la plus récente dans son club actuel pour un
//    championnat national ;
// 2. sinon le championnat national connu de son club (lignes d'autres joueurs) ;
// 3. sinon l'instantané players.competition, s'il ne désigne pas une
//    compétition non nationale connue.
export function clubNationalLeagues(statRows = [], competitionsById = {}) {
  const byClub = new Map();
  for (const row of statRows) {
    const competition = competitionsById[row.competition_id];
    if (!row.club_id || !isNationalLeague(competition)) continue;
    const year = Number((String(row.season || "").match(/\d{4}/) || [0])[0]);
    const current = byClub.get(row.club_id);
    if (!current || year > current.year) byClub.set(row.club_id, { year, competition });
  }
  return new Map([...byClub.entries()].map(([clubId, entry]) => [clubId, entry.competition]));
}

export function resolvePlayerLeague({ player, statRows = [], competitionsById = {}, clubLeagues = new Map() }) {
  const own = statRows
    .filter((row) => row.club_id && row.club_id === player?.club_id && isNationalLeague(competitionsById[row.competition_id]))
    .sort((a, b) => String(b.season || "").localeCompare(String(a.season || "")) || (Number(b.appearances) || 0) - (Number(a.appearances) || 0))[0];
  if (own) return { name: competitionsById[own.competition_id].name, competition: competitionsById[own.competition_id] };
  const clubLeague = player?.club_id ? clubLeagues.get(player.club_id) : null;
  if (clubLeague) return { name: clubLeague.name, competition: clubLeague };
  const snapshot = String(player?.competition || "").trim();
  if (!snapshot) return { name: null, competition: null };
  const named = Object.values(competitionsById).filter((item) => item?.name === snapshot);
  if (named.length && !named.some(isNationalLeague)) return { name: null, competition: null };
  return { name: snapshot, competition: named.find(isNationalLeague) || null };
}

// Pays à afficher : pays du club, sinon instantané valide, sinon pays du championnat.
export function resolvePlayerCountry({ player, club, league }) {
  return clubCountry(club) || validCountry(player?.country) || validCountry(league?.ext?.country) || null;
}
