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
    return syncPlayerCareers(db, competition, { ...ctx, includeCareerStats });
  },
};

export default playerCareersJob;
