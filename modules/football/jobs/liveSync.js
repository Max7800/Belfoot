// Job d'ingestion live (stub). Le serveur interrogera le provider de chaque
// compétition "live", puis upsertera matches + événements chez nous. Les
// visiteurs lisent NOTRE base. Aucun appel fournisseur côté visiteur.
import { supabase } from "@/lib/supabaseClient";
import { providerFor } from "../providers";
import { upsertExternal } from "../sync";

export default {
  key: "football.live-sync",
  async run() {
    const { data: comps } = await supabase.from("competitions").select("*").not("provider", "is", null);
    let n = 0;
    for (const comp of comps || []) {
      const provider = providerFor(comp);
      if (!provider?.fetchMatches) continue;               // aucun provider branché => on saute
      const matches = await provider.fetchMatches({ competition: comp });
      await upsertExternal("matches", comp.provider, matches, ["home_score", "away_score", "status", "minute"]);
      n += matches.length;
    }
    return `sync ${n} match(s)`;
  },
};
