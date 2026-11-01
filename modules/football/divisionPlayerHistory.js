import { getProvider } from "./providers";
import { loadDivisionCareerPlayers } from "./divisionCareerPlayers";
import { historySeasons } from "./playerHistoryPlan";
import { claimHistoryWork, finishHistoryWork } from "./playerHistoryWork";
import { syncCareerSeasonStats, syncPlayerCareers } from "./syncPlayerCareers";
import { isLeaseLost } from "@/lib/runLease";

// Chaque étape (parcours ou saison) possède son propre bail et son accusé
// durable. Une coupure peut rejouer des écritures idempotentes mais ne fait pas
// déclarer une étape terminée avant la fin de son traitement.
export async function syncDivisionPlayerHistory(db, competition, ctx = {}) {
  const { players, membershipCount } = await loadDivisionCareerPlayers(db, competition, ctx.season);
  if (!membershipCount) throw new Error("Aucun joueur rattaché à la division pour cette saison : vérifie d'abord les effectifs");
  if (membershipCount > players.length) throw new Error(`${membershipCount - players.length} joueur(s) sans identifiant fournisseur compatible : vérification nécessaire avant de déclarer la division complète`);
  const provider = getProvider(competition.provider);
  if (!provider?.fetchPlayerCareer || !provider?.fetchPlayerCareerSeason) throw new Error("Historiques de joueur non pris en charge");
  const seasons = historySeasons(ctx.now || new Date());
  const deadline = Number(ctx.deadline) || Date.now() + 35000;
  const limit = Math.max(1, Number(ctx.requestLimit) || 10);
  const count = () => Number(ctx.requestTracker?.count) || 0;
  let completed = 0;
  let work = 0;
  let stopped = false;
  let busy = 0;
  for (const player of players) {
    let playerDone = true;
    for (const season of ["0", ...seasons]) {
      if (Date.now() >= deadline || count() >= limit) { stopped = true; playerDone = false; break; }
      const claim = await claimHistoryWork(db, player.id, season);
      if (claim.state === "done") continue;
      if (claim.state === "busy") { busy++; playerDone = false; break; }
      try {
        if (season === "0") await syncPlayerCareers(db, competition, { ...ctx, playerId: player.id, includeCareerStats: false });
        else await syncCareerSeasonStats(db, provider, competition, player, { ...ctx, season });
        await finishHistoryWork(db, player.id, season, claim.token);
        work++;
      } catch (error) {
        if (isLeaseLost(error)) throw error;
        await finishHistoryWork(db, player.id, season, claim.token, String(error?.message || error));
        throw error;
      }
    }
    if (playerDone) completed++;
    if (stopped) break;
  }
  return {
    complete: !stopped && !busy,
    detail: `${completed}/${players.length} joueur(s) complets · ${work} étape(s) traitée(s)${busy ? ` · ${busy} joueur(s) en cours ailleurs` : ""}`,
    progress: { current: completed, total: players.length, unit: "joueurs" },
  };
}
