import "@/modules/football/apifootball";
import { scanBelgians } from "../scanBelgians";

// Balayage des championnats étrangers (pipeline global « Balayer les
// championnats ») : un lot de pages par exécution, reprise par checkpoint.
export default {
  key: "football.scan-belgians",
  async run({ db, ...ctx }) {
    if (!ctx.globalScope) throw new Error("Balayage des championnats : à lancer par le pipeline « Balayer les championnats ».");
    return scanBelgians(db, ctx);
  },
};
