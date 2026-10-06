import "@/modules/football/apifootball";
import { discoverBelgians } from "../discoverPlayers";
export default {
  key: "football.discover-belgians",
  async run({ db, competitionId, ...ctx }) {
    let query = db.from("competitions").select("*").not("provider", "is", null).order("id");
    if (competitionId) query = query.eq("id", competitionId);
    const { data: comps, error } = await query;
    if (error) throw error;
    const list = comps || [];
    if (!list.length) return "aucune compétition avec provider";

    // Checkpoint COMBINÉ (compétition + club) : un club par lot, que l'on cible une
    // compétition OU qu'on scanne tout le monde. Le pipeline reprend au bon endroit,
    // sans jamais dépasser le budget ni le timeout.
    const resume = ctx.resumeState || {};
    const compIndex = Math.max(0, Number(resume.compIndex) || 0);
    const clubIndex = Math.max(0, Number(resume.clubIndex) || 0);
    if (compIndex >= list.length) {
      return { detail: "Découverte terminée.", complete: true, progress: { current: list.length, total: list.length, unit: "compétitions" } };
    }

    const comp = list[compIndex];
    const result = await discoverBelgians(db, comp, {
      ...ctx,
      // En scan mondial (pas de compétition ciblée), chaque compétition garde SA
      // propre saison : forcer une saison unique (ex. 2026-2027) ne correspondrait à
      // aucun club importé ailleurs → 0 Belge détecté partout. Ciblé = saison du ctx.
      season: competitionId ? ctx.season : (comp.ext?.season || ctx.season),
      startClubIndex: clubIndex,
      saveClubCheckpoint: async (nextClubIndex) => ctx.saveCheckpoint?.({ compIndex, clubIndex: nextClubIndex }),
    });
    const detail = typeof result === "string" ? result : result.detail;
    const compDone = typeof result !== "object" || result.complete !== false;

    if (!compDone) {
      return { detail, complete: false, progress: (typeof result === "object" && result.progress) || { current: compIndex + 1, total: list.length, unit: "compétitions" } };
    }
    const nextCompIndex = compIndex + 1;
    await ctx.saveCheckpoint?.({ compIndex: nextCompIndex, clubIndex: 0 });
    return { detail: `${detail} · compétition ${nextCompIndex}/${list.length}`, complete: nextCompIndex >= list.length, progress: { current: nextCompIndex, total: list.length, unit: "compétitions" } };
  },
};
