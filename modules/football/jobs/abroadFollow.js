import "@/modules/football/apifootball";
import { followBelgiansAbroad } from "../belgiansAbroadFollow";

// Suivi des Belges à l'étranger (programme, feuilles de match, balayage) :
// lancé par la tâche planifiée competition-refresh, périmètre global.
export default {
  key: "football.abroad-follow",
  async run({ db, ...ctx }) {
    if (!ctx.globalScope) throw new Error("Suivi des Belges à l'étranger : lancé par la tâche planifiée uniquement.");
    return followBelgiansAbroad(db, ctx);
  },
};
