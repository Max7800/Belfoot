import "@/modules/football/apifootball";
import { syncTransfers } from "../syncTransfers";
import { requireCompetitionId } from "@/lib/jobScope";

export default {
  key: "football.transfers",
  async run({ db, competitionId, ...ctx }) {
    requireCompetitionId("football.transfers", competitionId);
    const { data: competition, error } = await db.from("competitions").select("*").eq("id", competitionId).maybeSingle();
    if (error) throw error;
    if (!competition?.provider) return "compétition ou provider introuvable";
    return syncTransfers(db, competition, {
      ...ctx,
      startClubIndex: Number(ctx.resumeState?.clubIndex) || 0,
      saveClubCheckpoint: async (clubIndex) => ctx.saveCheckpoint?.({ clubIndex }),
    });
  },
};
