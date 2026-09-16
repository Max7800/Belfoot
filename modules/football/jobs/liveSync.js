import "@/modules/football/thesportsdb";
import "@/modules/football/apifootball";
import { syncCompetition } from "../syncCompetition";

// Live : même mécanique (ré-upsert scores/statuts). À planifier plus fréquemment.
export default {
  key: "football.live-sync",
  async run({ db, competitionId, ...ctx }) {
    let _q = db.from("competitions").select("*").not("provider", "is", null); if (competitionId) _q = _q.eq("id", competitionId); const { data: comps } = await _q;
    if (!comps?.length) return "aucune compétition avec provider";
    const out = [];
    for (const c of comps) out.push(await syncCompetition(db, c, { ...ctx, mode: "live" }));
    return out.join(" | ");
  },
};
