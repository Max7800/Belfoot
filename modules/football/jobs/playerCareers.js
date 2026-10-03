import "@/modules/football/apifootball";
import { syncPlayerCareers } from "../syncPlayerCareers";

const playerCareersJob = {
  key: "football.player-careers",
  async run({ db, competitionId, ...ctx }) {
    const { data: competition, error } = await db.from("competitions").select("*").eq("id", competitionId).maybeSingle();
    if (error) throw error;
    if (!competition?.provider) throw new Error("Compétition introuvable ou sans provider");
    // Un joueur ciblé respecte le choix du bouton ; le lot (division) inclut
    // TOUJOURS les stats (étranger + saisons passées) — c'est tout son intérêt.
    const includeCareerStats = ctx.playerId ? ctx.includeCareerStats === true : true;
    // Full refresh reprenable : on fige l'horodatage de la passe à la 1re étape.
    // Chaque étape ne traite que les joueurs pas encore rafraîchis DANS cette passe
    // (career_synced_at < refreshBefore) → tous les joueurs sont refaits, une seule fois.
    const refreshBefore = ctx.playerId ? null : (ctx.resumeState?.refreshBefore || new Date().toISOString());
    if (refreshBefore) await ctx.saveCheckpoint?.({ refreshBefore });
    return syncPlayerCareers(db, competition, { ...ctx, includeCareerStats, refreshBefore });
  },
};

export default playerCareersJob;
