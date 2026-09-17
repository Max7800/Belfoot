import "@/modules/football/apifootball";
import { trackPlayers } from "../trackPlayers";
export default {
  key: "football.track-belgians",
  async run({ db, competitionId, ...ctx }) {
    let query = db.from("competitions").select("*").not("provider", "is", null);
    if (competitionId) query = query.eq("id", competitionId);
    const { data: competitions, error } = await query;
    if (error) throw error;
    if (!competitions?.length) return "aucune compétition avec provider";
    const out = [];
    for (const competition of competitions) out.push(await trackPlayers(db, competition, ctx));
    return out.join(" | ");
  },
};
