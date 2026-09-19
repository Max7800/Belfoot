import "@/modules/football/apifootball";
import { resolveNationalPlayerClubs } from "../resolveNationalPlayerClubs";

export default {
  key: "football.resolve-national-clubs",
  async run({ db, teamExternalId, ...ctx }) {
    return resolveNationalPlayerClubs(db, { ...ctx, teamExternalId });
  },
};
