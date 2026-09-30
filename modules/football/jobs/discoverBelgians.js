import "@/modules/football/apifootball";
import { discoverBelgians } from "../discoverPlayers";
export default {
  key: "football.discover-belgians",
  async run({ db, competitionId, ...ctx }) {
    let query = db.from("competitions").select("*").not("provider", "is", null);
    if (competitionId) query = query.eq("id", competitionId);
    const { data: comps, error } = await query;
    if (error) throw error;
    if (!comps?.length) return "aucune compétition avec provider";
    // Cas ciblé (une compétition) : un club par lot, repris automatiquement par
    // le pipeline via le checkpoint (comme les transferts).
    if (competitionId && comps.length === 1) {
      return discoverBelgians(db, comps[0], {
        ...ctx,
        startClubIndex: Number(ctx.resumeState?.clubIndex) || 0,
        saveClubCheckpoint: async (clubIndex) => ctx.saveCheckpoint?.({ clubIndex }),
      });
    }
    // Cas multi-compétitions (chemin secondaire, sans checkpoint).
    const out = [];
    for (const c of comps) { const r = await discoverBelgians(db, c, ctx); out.push(typeof r === "string" ? r : r.detail); }
    return out.join(" | ");
  },
};
