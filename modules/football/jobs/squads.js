import "@/modules/football/apifootball";
import { syncSquads } from "../syncSquads";
export default {
  key: "football.squads",
  async run({ db, ...ctx }) {
    const { data: comps } = await db.from("competitions").select("*").not("provider", "is", null);
    if (!comps?.length) return "aucune compétition avec provider";
    const out = []; for (const c of comps) out.push(await syncSquads(db, c, ctx));
    return out.join(" | ");
  },
};
