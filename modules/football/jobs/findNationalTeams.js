import "@/modules/football/apifootball";
import { getProvider } from "../providers";

export default {
  key: "football.find-national-teams",
  async run(ctx) {
    const provider = getProvider("apifootball");
    const teams = await provider.searchNationalTeams("Belgium", ctx);
    if (!teams.length) return "Aucune sélection trouvée pour Belgium";
    return teams.map((team) => `${team.name} = ID ${team.external_id}`).join(" · ");
  },
};
