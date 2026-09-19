import "@/modules/football/apifootball";
import { syncNationalTeam } from "../syncNationalTeam";

export default {
  key: "football.national-team",
  async run({ db, teamExternalId, nationalCategory, ...ctx }) {
    return syncNationalTeam(db, { ...ctx, teamExternalId, nationalCategory });
  },
};
