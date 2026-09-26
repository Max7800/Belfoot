import "@/modules/football/apifootball";
import { syncPlayerCareers } from "../syncPlayerCareers";

const playerCareersJob = {
  key: "football.player-careers",
  async run({ db, competitionId, ...ctx }) {
    const { data: competition, error } = await db.from("competitions").select("*").eq("id", competitionId).maybeSingle();
    if (error) throw error;
    if (!competition?.provider) throw new Error("Compétition introuvable ou sans provider");
    return syncPlayerCareers(db, competition, ctx);
  },
};

export default playerCareersJob;
