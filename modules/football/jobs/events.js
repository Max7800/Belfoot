import "@/modules/football/apifootball";
import { syncEvents } from "../syncEvents";
export default {
  key: "football.events",
  async run({ db, ...ctx }) {
    const { data: comps } = await db.from("competitions").select("*").not("provider", "is", null);
    if (!comps?.length) return "aucune compétition avec provider";
    const out = []; for (const c of comps) out.push(await syncEvents(db, c, ctx));
    return out.join(" | ");
  },
};
