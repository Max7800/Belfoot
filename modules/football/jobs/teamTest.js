import "@/modules/football/apifootball";
import { syncTeamTest } from "../syncTeamTest";

export default {
  key: "football.team-test",
  async run({ db, competitionId, teamExternalId, ...ctx }) {
    if (!competitionId) throw new Error("Choisis la compétition du club test");
    if (!teamExternalId) throw new Error("Renseigne l'ID API-Football du club test");
    const { data: competition, error } = await db.from("competitions").select("*").eq("id", competitionId).maybeSingle();
    if (error) throw error;
    if (!competition) throw new Error("Compétition introuvable");
    return syncTeamTest(db, competition, { ...ctx, teamExternalId });
  },
};
