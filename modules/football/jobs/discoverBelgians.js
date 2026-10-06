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

    // Checkpoint COMBINÉ (compétition + club) : un vrai lot de clubs par exécution
    // (l'endpoint squad est lent, on évite le timeout Vercel). En scan mondial, on
    // AVANCE sans dépenser de lot à travers les compétitions sans club / non
    // couvertes (aucun appel API, juste des requêtes DB rapides) et on ne s'arrête
    // que lorsqu'un vrai lot de clubs a été traité. Fini le ping-pong 1-par-1 sur
    // les dizaines de compétitions pas encore importées.
    const resume = ctx.resumeState || {};
    let compIndex = Math.max(0, Number(resume.compIndex) || 0);
    let clubIndex = Math.max(0, Number(resume.clubIndex) || 0);
    if (compIndex >= list.length) {
      return { detail: "Découverte terminée.", complete: true, progress: { current: list.length, total: list.length, unit: "compétitions" } };
    }

    const skipped = [];
    // Plafond de compétitions vides parcourues en une exécution : évite le timeout
    // même si la base compte des dizaines de ligues pas encore importées.
    const maxSkip = competitionId ? 1 : 30;

    while (compIndex < list.length) {
      const comp = list[compIndex];
      const result = await discoverBelgians(db, comp, {
        ...ctx,
        // En scan mondial, chaque compétition garde SA propre saison (ext.season) :
        // forcer une saison unique ne correspondrait à aucun club importé ailleurs.
        season: competitionId ? ctx.season : (comp.ext?.season || ctx.season),
        startClubIndex: clubIndex,
        saveClubCheckpoint: async (nextClubIndex) => ctx.saveCheckpoint?.({ compIndex, clubIndex: nextClubIndex }),
      });

      // Compétition sans club / non supportée → chaîne de texte : aucun appel API,
      // on passe immédiatement à la suivante sans consommer de lot.
      if (typeof result === "string") {
        skipped.push(result);
        compIndex += 1;
        clubIndex = 0;
        await ctx.saveCheckpoint?.({ compIndex, clubIndex: 0 });
        if (skipped.length >= maxSkip && compIndex < list.length) {
          // On rend la main par sécurité (timeout) mais le travail utile n'a pas
          // encore commencé : le pipeline reprend aussitôt au lot suivant.
          return { detail: `${skipped.length} compétition(s) sans club passées · ${compIndex}/${list.length}`, complete: false, progress: { current: compIndex, total: list.length, unit: "compétitions" } };
        }
        continue;
      }

      // Vrai lot traité (appels squad) : on s'arrête ici, reprise au club/compétition suivant.
      const detail = result.detail;
      if (result.complete === false) {
        return { detail, complete: false, progress: result.progress || { current: compIndex + 1, total: list.length, unit: "compétitions" } };
      }
      const nextCompIndex = compIndex + 1;
      await ctx.saveCheckpoint?.({ compIndex: nextCompIndex, clubIndex: 0 });
      return { detail: `${detail} · compétition ${nextCompIndex}/${list.length}`, complete: nextCompIndex >= list.length, progress: { current: nextCompIndex, total: list.length, unit: "compétitions" } };
    }

    return { detail: skipped.length ? `${skipped.length} compétition(s) sans club · scan terminé` : "Découverte terminée.", complete: true, progress: { current: list.length, total: list.length, unit: "compétitions" } };
  },
};
