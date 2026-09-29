import "@/modules/football/apifootball";
import { syncSquads } from "../syncSquads";
export default {
  key: "football.squads",
  async run({ db, competitionId, ...ctx }) {
    let _q = db.from("competitions").select("*").not("provider", "is", null); if (competitionId) _q = _q.eq("id", competitionId); const { data: comps } = await _q;
    if (!comps?.length) return "aucune compétition avec provider";
    const ordered = [...comps].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const startCompetition = Number(ctx.resumeState?.competitionIndex) || 0;
    const out = [];
    for (let index = startCompetition; index < ordered.length; index++) {
      const c = ordered[index];
      const outcome = await syncSquads(db, c, {
        ...ctx,
        startClubIndex: index === startCompetition ? Number(ctx.resumeState?.clubIndex) || 0 : 0,
        saveClubCheckpoint: async (clubIndex) => ctx.saveCheckpoint?.({ competitionIndex: index, clubIndex }),
      });
      const result = typeof outcome === "string" ? { detail: outcome, complete: true } : outcome;
      out.push(result.detail);
      if (!result.complete) return { ...result, detail: out.join(" | ") };
      await ctx.saveCheckpoint?.({ competitionIndex: index + 1, clubIndex: 0 });
    }
    return { detail: out.join(" | "), complete: true };
  },
};
