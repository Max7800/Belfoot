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
      const outcome = await syncCoaches(db, competition, {
        ...ctx,
        startClubIndex: index === startCompetition ? Number(ctx.resumeState?.clubIndex) || 0 : 0,
        saveClubCheckpoint: async (clubIndex) => ctx.saveCheckpoint?.({ competitionIndex: index, clubIndex }),
      });
      const result = typeof outcome === "string" ? { detail: outcome, complete: true } : outcome;
      output.push(result.detail);
      if (!result.complete) return { ...result, detail: output.join(" | ") };
      await ctx.saveCheckpoint?.({ competitionIndex: index + 1, clubIndex: 0 });
    }
    return { detail: output.join(" | "), complete: true };
  },
};
