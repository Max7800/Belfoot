// Balayage des championnats étrangers pour trouver TOUS les Belges (audit du
// 27/10/2026 : 37 Belges suivis à l'étranger seulement, la découverte ne
// parcourant que les compétitions importées et la nationalité principale).
//
// Une page de /players?league&season = 20 joueurs avec nationalité, lieu de
// naissance et statistiques dans ce championnat. On garde les joueurs de
// nationalité belge OU nés en Belgique ; chacun est suivi avec son club, son
// championnat (instantané) et ses chiffres de saison (players.ext.league_stats).
// Lots de pages bornés par exécution, reprise par checkpoint (pipeline global).
import { getProvider } from "./providers";
import { loadByExternalIds, upsertExternal } from "./sync";
import { birthExtPatch, hasBelgianNationality, providerIdentityPatch } from "@/lib/playerIdentity";
import { playerSnapshotPatch } from "@/lib/playerSnapshot";

// Championnats prioritaires (identifiants API-Football). `calendar` : saison
// calée sur l'année civile (Scandinavie, MLS, Japon).
export const SCAN_LEAGUES = [
  { id: "39", name: "Premier League", country: "England" }, { id: "40", name: "Championship", country: "England" }, { id: "41", name: "League One", country: "England" },
  { id: "61", name: "Ligue 1", country: "France" }, { id: "62", name: "Ligue 2", country: "France" }, { id: "63", name: "National", country: "France" },
  { id: "78", name: "Bundesliga", country: "Germany" }, { id: "79", name: "2. Bundesliga", country: "Germany" }, { id: "80", name: "3. Liga", country: "Germany" },
  { id: "135", name: "Serie A", country: "Italy" }, { id: "136", name: "Serie B", country: "Italy" },
  { id: "140", name: "La Liga", country: "Spain" }, { id: "141", name: "Segunda División", country: "Spain" },
  { id: "88", name: "Eredivisie", country: "Netherlands" }, { id: "89", name: "Eerste Divisie", country: "Netherlands" },
  { id: "94", name: "Primeira Liga", country: "Portugal" }, { id: "95", name: "Liga Portugal 2", country: "Portugal" },
  { id: "203", name: "Süper Lig", country: "Turkey" }, { id: "204", name: "1. Lig", country: "Turkey" },
  { id: "197", name: "Super League 1", country: "Greece" },
  { id: "179", name: "Premiership", country: "Scotland" }, { id: "180", name: "Championship", country: "Scotland" },
  { id: "207", name: "Super League", country: "Switzerland" }, { id: "208", name: "Challenge League", country: "Switzerland" },
  { id: "218", name: "Bundesliga", country: "Austria" },
  { id: "119", name: "Superliga", country: "Denmark" },
  { id: "103", name: "Eliteserien", country: "Norway", calendar: true },
  { id: "113", name: "Allsvenskan", country: "Sweden", calendar: true },
  { id: "106", name: "Ekstraklasa", country: "Poland" },
  { id: "318", name: "1. Division", country: "Cyprus" },
  { id: "210", name: "HNL", country: "Croatia" },
  { id: "345", name: "Czech Liga", country: "Czech-Republic" },
  { id: "283", name: "Liga I", country: "Romania" },
  { id: "271", name: "NB I", country: "Hungary" },
  { id: "172", name: "First League", country: "Bulgaria" },
  { id: "286", name: "Super Liga", country: "Serbia" },
  { id: "383", name: "Ligat Ha'al", country: "Israel" },
  { id: "261", name: "National Division", country: "Luxembourg" },
  { id: "307", name: "Pro League", country: "Saudi-Arabia" },
  { id: "305", name: "Stars League", country: "Qatar" },
  { id: "301", name: "Pro League", country: "United-Arab-Emirates" },
  { id: "253", name: "MLS", country: "USA", calendar: true },
  { id: "98", name: "J1 League", country: "Japan", calendar: true },
];
export const SCAN_PAGES_PER_RUN = 8;

const sameCountry = (a, b) => String(a || "").toLowerCase().replace(/[^a-z]/g, "") === String(b || "").toLowerCase().replace(/[^a-z]/g, "");

// Saison API d'un championnat : année de début (bascule au 1er juillet), ou
// année civile pour les championnats `calendar`.
export function scanSeason(league, now = new Date()) {
  const year = now.getUTCFullYear();
  return league.calendar ? year : (now.getUTCMonth() >= 6 ? year : year - 1);
}

// Lien belge : nationalité belge (même parmi d'autres) ou naissance en Belgique.
export const hasBelgianLink = (player) => hasBelgianNationality(player?.nationality) || /^(belgium|belgique)$/i.test(String(player?.birth_country || "").trim());

const youthTeam = (name) => /\b(u\d{2}|ii|b|jong|reserves?|youth|academy)\b/i.test(String(name || ""));

async function savePlayers(db, providerKey, league, season, found, now) {
  if (!found.length) return { saved: 0, created: 0 };
  const teams = [...new Map(found.filter((player) => player.team).map((player) => [player.team.external_id, player.team])).values()];
  const domesticLeague = { id: league.id, name: league.name, country: league.country, logo: league.logo || null };
  // Clubs : créés s'ils manquent, pays et championnat national ajoutés à ext.
  await upsertExternal(db, "clubs", providerKey, teams.map((team) => ({ external_id: team.external_id, name: team.name, logo_url: team.logo_url, ext: { country: league.country, domestic_league: domesticLeague } })), ["name", "logo_url"], { extMode: "merge" });
  const clubs = await loadByExternalIds(db, "clubs", providerKey, teams.map((team) => team.external_id), "id,external_id,team_type,ext");
  const existing = await loadByExternalIds(db, "players", providerKey, found.map((player) => player.external_id), "id,external_id,locked,club_id,nationality,country,competition,ext");
  const competition = { name: league.name, competition_scope: "etranger", competition_type: "league", ext: { country: league.country, providerType: "League" } };
  const seasonLabel = `${season}-${season + 1}`;
  let saved = 0; let created = 0;
  for (const player of found) {
    const current = existing.get(player.external_id) || null;
    if (current?.locked) continue;
    const club = player.team ? clubs.get(player.team.external_id) : null;
    const birth = birthExtPatch(current, player).ext?.birth || current?.ext?.birth;
    const patch = {
      source: providerKey,
      external_id: player.external_id,
      ...providerIdentityPatch(current, { nationality: player.nationality, birth_date: player.birth_date, name: player.name, photo_url: player.photo_url }),
      ...(player.position ? { position: player.position } : {}),
      ...(player.age != null ? { age: player.age } : {}),
      ...(club ? playerSnapshotPatch({ existing: current, club, competition, season: seasonLabel, primaryClub: !youthTeam(player.team?.name) && club.team_type !== "national", now }) : {}),
      ext: { ...(current?.ext || {}), ...(birth ? { birth } : {}), league_stats: { season: seasonLabel, league: league.name, league_id: league.id, league_logo: league.logo || null, country: league.country, club_id: club?.id || null, ...player.stats } },
      tracked: true,
      active: true,
      synced_at: now.toISOString(),
    };
    if (current) {
      const { error } = await db.from("players").update(patch).eq("id", current.id).eq("locked", false);
      if (error) throw error;
    } else {
      const { error } = await db.from("players").insert(patch);
      if (error) throw error;
      created++;
    }
    saved++;
  }
  return { saved, created };
}

export async function scanBelgians(db, ctx = {}) {
  const provider = getProvider("apifootball");
  if (!provider?.fetchLeaguePlayersPage) return { detail: "Balayage non supporté par le fournisseur.", complete: true };
  const leagues = ctx.leagues || SCAN_LEAGUES;
  const now = ctx.now || new Date();
  let leagueIndex = Math.max(0, Number(ctx.resumeState?.leagueIndex) || 0);
  let page = Math.max(1, Number(ctx.resumeState?.page) || 1);
  const pageBudget = Math.max(1, Math.min(SCAN_PAGES_PER_RUN, Math.floor(Number(ctx.requestLimit) || SCAN_PAGES_PER_RUN)));
  const notes = [];
  let pagesDone = 0; let found = 0; let created = 0;
  while (pagesDone < pageBudget && leagueIndex < leagues.length) {
    const target = leagues[leagueIndex];
    const season = scanSeason(target, now);
    const { players, pages } = await provider.fetchLeaguePlayersPage(target.id, season, page, ctx);
    pagesDone++;
    const apiCountry = players.find((player) => player.league?.country)?.league.country;
    // Identifiant de la liste incorrect : championnat écarté dès la 1re page.
    if (page === 1 && apiCountry && !sameCountry(apiCountry, target.country)) {
      notes.push(`${target.name} (${target.id}) écarté : pays API « ${apiCountry} »`);
      leagueIndex++; page = 1;
    } else {
      const belgians = players.filter(hasBelgianLink);
      const league = { ...target, name: players.find((player) => player.league?.name)?.league.name || target.name, logo: players.find((player) => player.league?.logo)?.league.logo || null };
      const result = await savePlayers(db, "apifootball", league, season, belgians, now);
      found += result.saved; created += result.created;
      if (page >= pages || !players.length) { leagueIndex++; page = 1; } else page++;
    }
    await ctx.saveCheckpoint?.({ leagueIndex, page });
  }
  const complete = leagueIndex >= leagues.length;
  return {
    detail: `${pagesDone} page(s) · ${found} Belge(s) mis à jour dont ${created} nouveau(x) · championnat ${Math.min(leagueIndex + 1, leagues.length)}/${leagues.length}${notes.length ? ` · ${notes.join(" ; ")}` : ""}`,
    complete,
    progress: { current: leagueIndex, total: leagues.length, unit: "championnats" },
  };
}
