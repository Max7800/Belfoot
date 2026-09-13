import "@/modules/football/apifootball";
import { discoverBelgians } from "../discoverPlayers";
export default {
  key: "football.discover-belgians",
  async run({ db, ...ctx }) {
    const { data: comps } = await db.from("competitions").select("*").not("provider", "is", null);
    if (!comps?.length) return "aucune compétition avec provider";
    const out = [];
    for (const c of comps) out.push(await discoverBelgians(db, c, ctx));
    return out.join(" | ");
  },
};
