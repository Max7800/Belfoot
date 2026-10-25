// « Synchroniser ce club » (fiche club, administration) : pour un club et une
// saison de sa compétition de référence, enchaîne
//   1. les matchs de la compétition (synchro complète, ~4 appels : le
//      classement reste cohérent avec les matchs du club) ;
//   2. l'effectif du club (≤ 4 appels) ;
//   3. l'entraîneur du club (1 appel).
// Le plan d'import doit autoriser la compétition et la saison au niveau
// « Archive enrichie » au moins (contrôlé par le préflight de runJob).
import "@/modules/football/apifootball";
import { requireCompetitionId } from "@/lib/jobScope";
import { syncCompetition } from "../syncCompetition";
import { syncSquads } from "../syncSquads";
import { syncCoaches } from "../syncCoaches";

const detailOf = (outcome) => (typeof outcome === "string" ? outcome : outcome?.detail || "");

const clubSyncJob = {
  key: "football.club-sync",
  async run({ db, competitionId, clubId, ...ctx }) {
    requireCompetitionId("football.club-sync", competitionId);
    if (!clubId) throw new Error("Synchroniser ce club : club manquant.");
    const [{ data: competition, error: competitionError }, { data: club, error: clubError }] = await Promise.all([
      db.from("competitions").select("*").eq("id", competitionId).maybeSingle(),
      db.from("clubs").select("id,name,external_id,source,team_type").eq("id", clubId).maybeSingle(),
    ]);
    if (competitionError || clubError) throw competitionError || clubError;
    if (!competition) throw new Error("Compétition introuvable.");
    if (!club) throw new Error("Club introuvable.");
    if (!club.external_id || club.source !== competition.provider) throw new Error(`${club.name} : club non relié au fournisseur ${competition.provider}, synchronisation impossible.`);
    if (club.team_type === "national") throw new Error(`${club.name} : sélection nationale — utiliser « Synchroniser une sélection ».`);

    const matches = await syncCompetition(db, competition, { ...ctx, mode: "full" });
    const squad = await syncSquads(db, competition, { ...ctx, onlyClubId: club.id });
    const coach = await syncCoaches(db, competition, { ...ctx, onlyClubId: club.id });
    return `${club.name} (${ctx.season || "saison courante"}) · matchs : ${detailOf(matches)} · effectif : ${detailOf(squad)} · entraîneur : ${detailOf(coach)}`;
  },
};

export default clubSyncJob;
