import "@/modules/football/apifootball";
import { syncSquads } from "../syncSquads";
export default {
  key: "football.squads",
  async run({ db, competitionId, ...ctx }) {
    let _q = db.from("competitions").select("*").not("provider", "is", null); if (competitionId) _q = _q.eq("id", competitionId); const { data: comps } = await _q;
    if (!comps?.length) return "aucune compétition avec provider";
    const out = []; for (const c of comps) out.push(await syncSquads(db, c, ctx));
    return out.join(" | ");
  },
};
