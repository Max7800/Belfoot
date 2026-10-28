import "@/modules/football/apifootball";
import { syncBelgianSeasonStats } from "../belgianSeasonStats";

// Saisons passées des Belges à l'étranger (pipeline global « Saisons passées
// des Belges à l'étranger ») : un lot de joueurs par exécution, repris ensuite.
export default {
  key: "football.belgian-season-stats",
  async run({ db, ...ctx }) {
    if (!ctx.globalScope) throw new Error("Saisons passées des Belges : à lancer par le pipeline « Saisons passées des Belges à l'étranger ».");
    return syncBelgianSeasonStats(db, ctx);
  },
};
