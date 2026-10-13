import "@/modules/football/thesportsdb";
import "@/modules/football/apifootball";              // enregistre le provider
import { syncCompetition } from "../syncCompetition";
import { requireCompetitionId } from "@/lib/jobScope";

export default {
  key: "football.sync",
  async run({ db, competitionId, ...ctx }) {
    requireCompetitionId("football.sync", competitionId);
    let _q = db.from("competitions").select("*").not("provider", "is", null); if (competitionId) _q = _q.eq("id", competitionId); const { data: comps } = await _q;
    if (!comps?.length) return "aucune compétition avec provider";
    const out = [];
    for (const c of comps) out.push(await syncCompetition(db, c, { ...ctx, mode: "full" }));
    return out.join(" | ");
  },
};
