// Suivi match par match des Belges à l'étranger, y compris dans les
// championnats que Belfoot n'importe pas (niveau 2, demandé le 28/10/2026).
//
// Un passage (job football.abroad-follow, lancé par la tâche planifiée) :
//   1. programme d'UN championnat suivi dû (une fois par jour et par
//      championnat) : un appel donne les 2 derniers jours et les 7 prochains ;
//      seuls les matchs des clubs où jouent des Belges sont enregistrés, dans
//      une compétition masquée ;
//   2. feuilles des matchs terminés de ces clubs (compositions, statistiques
//      joueurs et collectives, faits), 2 matchs au plus ;
//   3. balayage continu des championnats pour trouver de nouveaux Belges :
//      un cycle complet par semaine pendant le mercato, toutes les deux
//      semaines sinon (modules/football/scanBelgians.js).
// État : site_settings.football_abroad_follow_state.
import { getProvider } from "./providers";
import { ensureCompetitions, idMapByExternalIds, upsertExternal } from "./sync";
import { ensureSeason, seasonLabel } from "./season";
import { resolveMatches } from "./syncCompetition";
import { syncLineups } from "./syncLineups";
import { syncEvents } from "./syncEvents";
import { SCAN_LEAGUES, scanBelgians, scanSeason } from "./scanBelgians";
import { readAll } from "@/lib/readAll";
import { updateSiteSettings } from "@/lib/siteSettings";
import { isLeaseLost } from "@/lib/runLease";

export const FIXTURES_EVERY_HOURS = 20;
// Programme en échec (API indisponible, abonnement coupé le 28/10/2026) : retenté après 2 h.
export const FIXTURES_RETRY_HOURS = 2;
export const DETAIL_MATCHES_PER_RUN = 2;
export const DETAIL_LOOKBACK_DAYS = 10;
export const SCAN_PAGES_PER_FOLLOW = 3;
const DAY = 86400000;

// Mercato (juillet-août, janvier) : un cycle de balayage par semaine ; sinon deux semaines.
export const scanIntervalDays = (now = new Date()) => ([0, 6, 7].includes(now.getUTCMonth()) ? 7 : 14);


// Championnats et clubs à suivre, d'après les Belges trouvés par le balayage.
export function followTargets(players = [], clubs = {}) {
  const leagues = new Map();
  for (const player of players) {
    const stats = player.ext?.league_stats;
    const club = clubs[player.club_id];
    if (!stats?.league_id || !club?.external_id) continue;
    const known = SCAN_LEAGUES.find((league) => league.id === String(stats.league_id));
    const entry = leagues.get(String(stats.league_id)) || { id: String(stats.league_id), name: stats.league || known?.name || "Championnat", country: stats.country || known?.country || null, logo: stats.league_logo || null, calendar: Boolean(known?.calendar), clubs: new Set() };
    entry.clubs.add(String(club.external_id));
    leagues.set(entry.id, entry);
  }
  return [...leagues.values()];
}

// Championnat dont le programme est à relire (jamais lu, ou il y a plus de 20 h), le plus ancien d'abord.
export function dueLeague(targets, state = {}, now = Date.now()) {
  const last = (id) => Date.parse(state[id]?.fixturesAt || "") || 0;
  const wait = (id) => (state[id]?.error ? FIXTURES_RETRY_HOURS : FIXTURES_EVERY_HOURS) * 3600000;
  return targets.filter((target) => now - last(target.id) >= wait(target.id)).sort((a, b) => last(a.id) - last(b.id))[0] || null;
}

// Balayage continu : premier passage = le pipeline manuel vient de tourner ;
// cycle en cours = on avance ; cycle fini = on attend l'intervalle.
export function scanStep(scan = null, now = new Date()) {
  if (!scan) return { run: false, next: { leagueIndex: 0, page: 1, cycleStartedAt: now.toISOString(), cycleCompletedAt: now.toISOString() } };
  if (!scan.cycleCompletedAt || Date.parse(scan.cycleCompletedAt) < Date.parse(scan.cycleStartedAt || 0)) return { run: true, next: scan };
  if (now.getTime() - (Date.parse(scan.cycleStartedAt || "") || 0) >= scanIntervalDays(now) * DAY) {
    return { run: true, next: { leagueIndex: 0, page: 1, cycleStartedAt: now.toISOString(), cycleCompletedAt: null } };
  }
  return { run: false, next: scan };
}

async function importFixtures(db, provider, target, now, ctx) {
  const season = scanSeason(target, now);
  // Saison complète du championnat (même appel que la synchro des résultats) puis
  // fenêtre filtrée ici : l'appel par dates (from/to) est refusé par l'API avec
  // l'abonnement actuel (« Free plans do not have access to this season », 28/10/2026).
  const fixtures = await provider.fetchMatches({ external_id: target.id, ext: { season: String(season) } }, { ...ctx, season: String(season) });
  const from = now.getTime() - 2 * DAY; const to = now.getTime() + 7 * DAY;
  const relevant = fixtures.filter((match) => (target.clubs.has(String(match.home_ext)) || target.clubs.has(String(match.away_ext))) && Date.parse(match.kickoff || "") >= from && Date.parse(match.kickoff || "") <= to);
  if (!relevant.length) return { season, imported: 0, competitionId: null };
  const competitions = await ensureCompetitions(db, "apifootball", [{ external_id: target.id, name: target.name, logo_url: target.logo, competition_type: "league", competition_scope: "etranger", ext: { country: target.country, season: String(season), imported_for: "belgians-abroad" } }]);
  const competition = competitions.get(target.id);
  const seasonRow = await ensureSeason(db, competition.id, String(season));
  const missing = relevant.flatMap((match) => [{ external_id: match.home_ext, name: match.home_name, logo_url: match.home_logo }, { external_id: match.away_ext, name: match.away_name, logo_url: match.away_logo }]);
  await upsertExternal(db, "clubs", "apifootball", missing, [], { extMode: "keep" });
  const clubMap = await idMapByExternalIds(db, "clubs", "apifootball", missing.map((club) => club.external_id));
  const rows = resolveMatches(relevant, competition.id, seasonRow.id, clubMap);
  await upsertExternal(db, "matches", "apifootball", rows, ["competition_id", "season_id", "home_club_id", "away_club_id", "home_score", "away_score", "status", "minute", "kickoff", "matchday", "round_raw", "phase", "round_number"]);
  return { season, imported: rows.length, competitionId: competition.id };
}

export async function followBelgiansAbroad(db, ctx = {}) {
  const provider = getProvider("apifootball");
  const now = ctx.now || new Date();
  const deadline = Number(ctx.deadline) || Infinity;
  const { data: settings, error: settingsError } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
  if (settingsError) throw settingsError;
  const state = { leagues: {}, ...(settings?.data?.football_abroad_follow_state || {}) };
  const notes = [];

  // Belges trouvés par le balayage et leurs clubs.
  const { data: players, error: playersError } = await readAll(() => db.from("players").select("id,club_id,ext").eq("tracked", true).eq("active", true).not("ext->league_stats", "is", null));
  if (playersError) throw playersError;
  const clubIds = [...new Set((players || []).map((player) => player.club_id).filter(Boolean))];
  const { data: clubRows, error: clubsError } = clubIds.length ? await readAll(() => db.from("clubs").select("id,external_id").in("id", clubIds)) : { data: [] };
  if (clubsError) throw clubsError;
  const targets = followTargets(players || [], Object.fromEntries((clubRows || []).map((club) => [club.id, club])));

  // 1. Programme d'un championnat.
  const target = dueLeague(targets, state.leagues, now.getTime());
  if (target && Date.now() < deadline) {
    try {
      const result = await importFixtures(db, provider, target, now, ctx);
      // Compétition mémorisée : elle peut exister avant le suivi (créée par les carrières).
      state.leagues = { ...state.leagues, [target.id]: { fixturesAt: now.toISOString(), matches: result.imported, competitionId: result.competitionId || state.leagues[target.id]?.competitionId || null } };
      notes.push(`${target.name} : ${result.imported} match(s) de Belges`);
    } catch (error) {
      if (isLeaseLost(error)) throw error;
      // Programme refusé par l'API (constaté le 28/10/2026 : « Free plans do not
      // have access to this season ») : noté avec la requête, reporté au
      // lendemain, sans bloquer les feuilles de match ni le balayage.
      const message = `${target.name} (${target.id}, saison ${scanSeason(target, now)}) : ${String(error?.message || error).slice(0, 160)}`;
      state.leagues = { ...state.leagues, [target.id]: { ...(state.leagues[target.id] || {}), fixturesAt: now.toISOString(), error: message } };
      notes.push(`programme en échec — ${message}`);
    }
  }

  // 2. Feuilles des matchs terminés des Belges (compétitions masquées du suivi).
  const followedIds = [...new Set(Object.values(state.leagues).map((entry) => entry.competitionId).filter(Boolean))];
  const { data: abroadCompetitions, error: competitionsError } = followedIds.length ? await db.from("competitions").select("*").in("id", followedIds) : { data: [], error: null };
  if (competitionsError) throw competitionsError;
  // Match dont la feuille échoue deux fois : écarté (sinon chaque passage rebuterait dessus).
  const failures = { ...(state.failures || {}) };
  const skipped = Object.entries(failures).filter(([, count]) => count >= 2).map(([id]) => id);
  let detailed = 0;
  for (let step = 0; step < DETAIL_MATCHES_PER_RUN && (abroadCompetitions || []).length && Date.now() < deadline; step++) {
    const { data: pending, error: pendingError } = await db.from("matches").select("id,competition_id,season_id")
      .in("competition_id", abroadCompetitions.map((competition) => competition.id)).eq("status", "finished")
      .is("player_stats_synced_at", null).gte("kickoff", new Date(now.getTime() - DETAIL_LOOKBACK_DAYS * DAY).toISOString())
      .not("id", "in", `(${["00000000-0000-0000-0000-000000000000", ...skipped].join(",")})`)
      .order("kickoff", { ascending: false }).limit(1);
    if (pendingError) throw pendingError;
    const match = pending?.[0];
    if (!match) break;
    const competition = abroadCompetitions.find((item) => item.id === match.competition_id);
    const { data: season } = await db.from("seasons").select("label").eq("id", match.season_id).maybeSingle();
    const label = seasonLabel(season?.label || competition.ext?.season);
    try {
      await syncLineups(db, competition, { ...ctx, season: label, matchCap: 1, drain: true });
      await syncEvents(db, competition, { ...ctx, season: label, eventsCap: 1, drain: true });
    } catch (error) {
      if (isLeaseLost(error)) throw error;
      failures[match.id] = (failures[match.id] || 0) + 1;
      notes.push(`feuille en échec (${String(error?.message || error).slice(0, 80)})`);
      break;
    }
    detailed++;
  }
  if (detailed) notes.push(`${detailed} feuille(s) de match`);
  state.failures = failures;

  // 3. Balayage continu.
  const scan = scanStep(state.scan, now);
  state.scan = scan.next;
  if (scan.run && Date.now() < deadline) {
    const result = await scanBelgians(db, { ...ctx, now, requestLimit: SCAN_PAGES_PER_FOLLOW, resumeState: state.scan, saveCheckpoint: async (checkpoint) => { state.scan = { ...state.scan, ...checkpoint }; } });
    if (result.complete) state.scan = { ...state.scan, leagueIndex: 0, page: 1, cycleCompletedAt: now.toISOString() };
    notes.push(`balayage : ${result.detail}`);
  }

  await updateSiteSettings(db, { football_abroad_follow_state: state });
  return { detail: notes.length ? notes.join(" · ") : `${targets.length} championnat(s) suivi(s), rien à faire`, complete: true, meta: { leagues: targets.length } };
}
