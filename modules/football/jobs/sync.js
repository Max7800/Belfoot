import "@/modules/football/thesportsdb";
import "@/modules/football/apifootball";              // enregistre le provider
import { syncCompetition } from "../syncCompetition";

export default {
  key: "football.sync",
  async run({ db, ...ctx }) {
    const { data: comps } = await db.from("competitions").select("*").not("provider", "is", null);
    if (!comps?.length) return "aucune compétition avec provider";
    const out = [];
    for (const c of comps) out.push(await syncCompetition(db, c, ctx));
    return out.join(" | ");
  },
};
