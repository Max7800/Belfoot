import { getProvider } from "./providers";
import { loadDivisionCareerPlayers } from "./divisionCareerPlayers";
import { historySeasons } from "./playerHistoryPlan";
import { claimHistoryWork, finishHistoryWork, patchHistoryMetadata } from "./playerHistoryWork";
import { syncCareerSeasonStats, syncPlayerCareers } from "./syncPlayerCareers";
import { isLeaseLost } from "@/lib/runLease";

// Chaque étape (parcours ou saison) possède son propre bail et son accusé
// durable. Une coupure peut rejouer des écritures idempotentes mais ne fait pas
// déclarer une étape terminée avant la fin de son traitement.
export async function syncDivisionPlayerHistory(db, competition, ctx = {}) {
  const { players, membershipCount } = await loadDivisionCareerPlayers(db, competition, ctx.season);
  if (!membershipCount) throw new Error("Aucun joueur rattaché à la division pour cette saison : vérifie d'abord les effectifs");
  const unresolved = Math.max(0, membershipCount - players.length);
  const provider = getProvider(competition.provider);
  if (!provider?.fetchPlayerCareer || !provider?.fetchPlayerCareerSeason) throw new Error("Historiques de joueur non pris en charge");
  const seasons = historySeasons(ctx.now || new Date());
  // Chaque paquet contient au plus 100 joueurs × 6 étapes : aucune lecture ne
  // dépasse le plafond Supabase de 1 000 lignes. Les étapes déjà terminées ne
  // nécessitent ensuite aucun RPC individuel à chaque passage du cron.
  const states = new Map();
  const years = [0, ...seasons.map(Number)];
  for (let offset = 0; offset < players.length; offset += 100) {
    const ids = players.slice(offset, offset + 100).map((player) => player.id);
    const result = await db.from("player_history_work").select("player_id,season,state,lease_expires_at,last_error").in("player_id", ids).in("season", years).limit(600);
    if (result.error) throw result.error;
    for (const row of result.data || []) states.set(`${row.player_id}:${row.season}`, row);
  }
  const deadline = Number(ctx.deadline) || Date.now() + 35000;
  const limit = Math.min(Math.max(1, Number(ctx.requestLimit) || 10), Math.max(1, Number(ctx.maxHistoryRequestsPerRun) || Infinity));
  const count = () => Number(ctx.requestTracker?.count) || 0;
  let work = 0;
  let stopped = false;
  let busy = 0;
  let failed = 0;
  let retryAfter = null;
  for (const player of players) {
    for (const season of ["0", ...seasons]) {
      if (states.get(`${player.id}:${season}`)?.state === "done") continue;
      if (Date.now() >= deadline || count() >= limit) { stopped = true; break; }
      const claim = await claimHistoryWork(db, player.id, season);
      if (claim.state === "done") { states.set(`${player.id}:${season}`, { state: "done" }); continue; }
      if (claim.state === "busy" || claim.state === "error") {
        busy++;
        if (claim.state === "error") failed++;
        if (claim.retryAfter && (!retryAfter || claim.retryAfter < retryAfter)) retryAfter = claim.retryAfter;
        break;
      }
      try {
        const historyLease = { playerId: player.id, season: Number(season), token: claim.token };
        if (season === "0") await syncPlayerCareers(db, competition, { ...ctx, historyWork: true, historyLease, playerId: player.id, includeCareerStats: false });
        else {
          await syncCareerSeasonStats(db, provider, competition, player, { ...ctx, historyWork: true, historyLease, season });
          await patchHistoryMetadata(db, player.id, { career_stats_seasons: { [season]: new Date().toISOString() } });
        }
        await finishHistoryWork(db, player.id, season, claim.token);
        states.set(`${player.id}:${season}`, { state: "done" });
        work++;
      } catch (error) {
        if (isLeaseLost(error)) throw error;
        await finishHistoryWork(db, player.id, season, claim.token, String(error?.message || error));
        throw error;
      }
    }
    if (stopped) break;
  }
  // Le lot peut s'arrêter au milieu de la liste ; les joueurs déjà complets
  // après ce point comptent eux aussi dans l'avancement global.
  const completed = players.filter((player) => years.every((season) => states.get(`${player.id}:${season}`)?.state === "done")).length;
  return {
    complete: !stopped && !busy && !unresolved,
    detail: `${completed}/${players.length} joueur(s) vérifiés parmi les effectifs connus · ${work} étape(s) traitée(s)${busy - failed ? ` · ${busy - failed} joueur(s) en cours ailleurs` : ""}${failed ? ` · ${failed} joueur(s) en erreur, nouvelle tentative différée` : ""}${unresolved ? ` · ${unresolved} fiche(s) sans identifiant fournisseur compatible` : ""}`,
    progress: { current: completed, total: players.length, unit: "joueurs" },
    // Si les lectures préparatoires ont épuisé le temps disponible, ne pas
    // enchaîner instantanément des lots vides : laisser un délai de reprise.
    meta: { waitForLease: ((busy > 0 || unresolved > 0) && !stopped) || (stopped && work === 0 && count() === 0 && Date.now() >= deadline), retryAfter },
  };
}
