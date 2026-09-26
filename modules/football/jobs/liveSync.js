import "@/modules/football/thesportsdb";
import "@/modules/football/apifootball";
import { syncCompetition } from "../syncCompetition";
import { syncEvents } from "../syncEvents";

// Live : même mécanique (ré-upsert scores/statuts). À planifier plus fréquemment.
export default {
  key: "football.live-sync",
  async run({ db, competitionId, ...ctx }) {
    let query = db.from("competitions").select("*").not("provider", "is", null);
    if (competitionId) query = query.eq("id", competitionId);
    else query = query.eq("live_enabled", true);
    const { data: comps, error } = await query;
    if (error) throw error;
    if (!comps?.length) return competitionId ? "compétition introuvable ou sans provider" : "aucune compétition activée pour le direct";
    const out = [];
    let remainingMatchBudget = Math.max(1, Math.min(Number(ctx.matchCap) || 3, 20));
    for (const competition of comps) {
      const { data: before, error: beforeError } = remainingMatchBudget > 0
        ? await db.from("matches").select("id").eq("competition_id", competition.id).eq("status", "live").limit(remainingMatchBudget)
        : { data: [], error: null };
      if (beforeError) throw beforeError;
      const scores = await syncCompetition(db, competition, { ...ctx, mode: "live" });
      const events = before?.length
        ? await syncEvents(db, competition, { ...ctx, matchCap: remainingMatchBudget, mode: "live", liveMatchIds: before.map((match) => match.id) })
        : `${competition.name}: aucun événement live dans le plafond global`;
      remainingMatchBudget -= before?.length || 0;
      out.push(`${scores} · ${events}`);
    }
    return out.join(" | ");
  },
};
