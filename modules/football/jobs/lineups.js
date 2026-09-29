import "@/modules/football/apifootball";
import { syncLineups } from "../syncLineups";

export default {
  key: "football.lineups",
  async run({ db, competitionId, ...ctx }) {
    if (!competitionId) return "choisis une compétition pour lancer les compositions sans gaspiller le quota";
    let query = db.from("competitions").select("*").not("provider", "is", null);
    query = query.eq("id", competitionId);
    const { data: competitions, error } = await query;
    if (error) throw error;
    if (!competitions?.length) return "aucune compétition avec provider";
    const output = [];
    for (const competition of competitions) {
      const outcome = await syncLineups(db, competition, ctx);
      const result = typeof outcome === "string" ? { detail: outcome, complete: true } : outcome;
      output.push(result.detail);
      if (!result.complete) return { ...result, detail: output.join(" | ") };
    }
    return { detail: output.join(" | "), complete: true };
  },
};
