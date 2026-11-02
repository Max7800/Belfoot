import "@/modules/football/apifootball";
import { requireCompetitionId } from "@/lib/jobScope";
import { syncDivisionPlayerHistory } from "../divisionPlayerHistory";

const divisionPlayerHistoryJob = {
  key: "football.division-history",
  async run({ db, competitionId, ...ctx }) {
    requireCompetitionId("football.division-history", competitionId);
    const { data: competition, error } = await db.from("competitions").select("*").eq("id", competitionId).maybeSingle();
    if (error) throw error;
    if (competition?.provider !== "apifootball" || String(competition.external_id) !== "144") throw new Error("Ce traitement est réservé à la Jupiler Pro League API-Football (144).");
    return syncDivisionPlayerHistory(db, competition, { ...ctx, providerAttempts: 1 });
  },
};

export default divisionPlayerHistoryJob;
