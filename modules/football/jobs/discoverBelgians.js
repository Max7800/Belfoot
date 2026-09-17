import "@/modules/football/apifootball";
import { discoverBelgians } from "../discoverPlayers";
export default {
  key: "football.discover-belgians",
  async run({ db, competitionId, ...ctx }) {
    let query = db.from("competitions").select("*").not("provider", "is", null);
    if (competitionId) query = query.eq("id", competitionId);
    const { data: comps, error } = await query;
    if (error) throw error;
    if (!comps?.length) return "aucune compétition avec provider";
    const out = [];
    for (const c of comps) out.push(await discoverBelgians(db, c, ctx));
    return out.join(" | ");
  },
};
