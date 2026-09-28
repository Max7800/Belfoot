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
    const ordered = [...competitions].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const startCompetition = Number(ctx.resumeState?.competitionIndex) || 0;
    const output = [];
    for (let index = startCompetition; index < ordered.length; index++) {
      const competition = ordered[index];
      output.push(await syncCoaches(db, competition, {
        ...ctx,
        startClubIndex: index === startCompetition ? Number(ctx.resumeState?.clubIndex) || 0 : 0,
        saveClubCheckpoint: async (clubIndex) => ctx.saveCheckpoint?.({ competitionIndex: index, clubIndex }),
      }));
      await ctx.saveCheckpoint?.({ competitionIndex: index + 1, clubIndex: 0 });
    }
    return output.join(" | ");
  },
};
