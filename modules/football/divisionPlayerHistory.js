import { getProvider } from "./providers";
import { loadDivisionCareerPlayers } from "./divisionCareerPlayers";
import { playerHistoryPlan } from "./playerHistoryPlan";
import { syncCareerSeasonStats, syncPlayerCareers } from "./syncPlayerCareers";

// Un lot s'arrête entre deux appels. Les statistiques sont acquittées saison par
// saison, après l'écriture des données, pour reprendre sans oublier une saison.
export async function syncDivisionPlayerHistory(db, competition, ctx = {}) {
  const { players, membershipCount } = await loadDivisionCareerPlayers(db, competition, ctx.season);
  if (!membershipCount) throw new Error("Aucun joueur rattaché à la division pour cette saison : vérifie d'abord les effectifs");
  if (membershipCount > players.length) throw new Error(`${membershipCount - players.length} joueur(s) sans identifiant fournisseur compatible : vérification nécessaire avant de déclarer la division complète`);
  const provider = getProvider(competition.provider);
  if (!provider?.fetchPlayerCareer || !provider?.fetchPlayerCareerSeason) throw new Error("Historiques de joueur non pris en charge");
  const now = ctx.now || new Date();
  const deadline = Number(ctx.deadline) || Date.now() + 35000;
  const limit = Math.max(1, Number(ctx.requestLimit) || 10);
  const count = () => Number(ctx.requestTracker?.count) || 0;
  let completed = 0;
  let work = 0;
  let stopped = false;
  for (const player of players) {
    let plan = playerHistoryPlan(player, now);
    if (!plan.careerMissing && !plan.missing.length && !plan.failed.length) { completed++; continue; }
    if (Date.now() >= deadline || count() >= limit) { stopped = true; break; }
    if (plan.careerMissing) {
      await syncPlayerCareers(db, competition, { ...ctx, playerId: player.id, includeCareerStats: false });
      work++;
    }
    // Relecture après le parcours : d'autres marqueurs ont pu être enregistrés.
    const loaded = await db.from("players").select("id,name,external_id,source,nationality,career_synced_at,career_sync_status,ext").eq("id", player.id).maybeSingle();
    if (loaded.error) throw loaded.error;
    if (!loaded.data) throw new Error(`Joueur ${player.id} introuvable`);
    let current = loaded.data;
    plan = playerHistoryPlan(current, now);
    for (const season of [...plan.missing, ...plan.failed].sort()) {
      if (Date.now() >= deadline || count() >= limit) { stopped = true; break; }
      await syncCareerSeasonStats(db, provider, competition, current, { ...ctx, season });
      work++;
      const ext = { ...(current.ext || {}), career_stats_seasons: { ...(current.ext?.career_stats_seasons || {}), [season]: new Date().toISOString() } };
      const saved = await db.from("players").update({ ext }).eq("id", current.id);
      if (saved.error) throw saved.error;
      current = { ...current, ext };
    }
    if (stopped) break;
    completed++;
  }
  return {
    complete: !stopped,
    detail: `${completed}/${players.length} joueur(s) complets · ${work} appel(s) de parcours ou saison · ${membershipCount - players.length} fiche(s) sans identifiant fournisseur compatible`,
    progress: { current: completed, total: players.length, unit: "joueurs" },
  };
}
