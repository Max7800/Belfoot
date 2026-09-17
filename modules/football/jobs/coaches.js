import "@/modules/football/apifootball";
import "@/modules/football/thesportsdb";
import { syncCoaches } from "../syncCoaches";

export default {
  key: "football.coaches",
  async run({ db, competitionId, ...ctx }) {
    let query = db.from("competitions").select("*").not("provider", "is", null);
    if (competitionId) query = query.eq("id", competitionId);
    const { data: competitions } = await query;
    if (!competitions?.length) return "aucune compétition avec provider";
    const output = [];
    for (const competition of competitions) output.push(await syncCoaches(db, competition, ctx));
    return output.join(" | ");
  },
};
