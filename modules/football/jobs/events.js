import "@/modules/football/apifootball";
import { syncEvents } from "../syncEvents";
import { requireCompetitionId } from "@/lib/jobScope";
export default {
  key: "football.events",
  async run({ db, competitionId, ...ctx }) {
    requireCompetitionId("football.events", competitionId);
    let _q = db.from("competitions").select("*").not("provider", "is", null); if (competitionId) _q = _q.eq("id", competitionId); const { data: comps } = await _q;
    if (!comps?.length) return "aucune compétition avec provider";
    const out = [];
    for (const competition of comps) {
      const outcome = await syncEvents(db, competition, ctx);
      const result = typeof outcome === "string" ? { detail: outcome, complete: true } : outcome;
      out.push(result.detail);
      if (!result.complete) return { ...result, detail: out.join(" | ") };
    }
    return { detail: out.join(" | "), complete: true };
  },
};
