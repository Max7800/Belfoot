import "@/modules/football/thesportsdb";
import "@/modules/football/apifootball";
import { syncCompetition } from "../syncCompetition";

// Live : même mécanique (ré-upsert scores/statuts). À planifier plus fréquemment.
export default {
  key: "football.live-sync",
  async run({ db, ...ctx }) {
    const { data: comps } = await db.from("competitions").select("*").not("provider", "is", null);
    if (!comps?.length) return "aucune compétition avec provider";
    const out = [];
    for (const c of comps) out.push(await syncCompetition(db, c, ctx));
    return out.join(" | ");
  },
};
