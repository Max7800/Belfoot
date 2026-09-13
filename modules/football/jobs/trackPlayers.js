import "@/modules/football/apifootball";
import { trackPlayers } from "../trackPlayers";
export default {
  key: "football.track-belgians",
  async run({ db, ...ctx }) { return trackPlayers(db, ctx); },
};
