// Diagnostic borné : une compétition, une saison, un appel fournisseur au plus.
// Les données sportives ne sont jamais écrites ; runJob journalise l'exécution.
import "@/modules/football/apifootball";
import { getProvider } from "../providers";
import { requireCompetitionId } from "@/lib/jobScope";
import { readAll } from "@/lib/readAll";

function apiYear(value) {
  const m = /^(19\d{2}|20\d{2})(?:-(19\d{2}|20\d{2}))?$/.exec(String(value || "").trim());
  if (!m || (m[2] && Number(m[2]) !== Number(m[1]) + 1)) throw new Error("Choisis explicitement une saison valide (2026 ou 2026-2027) : aucun appel API.");
  return m[1];
}

const fixtureCheckJob = {
  key: "football.fixture-check",
  async run({ db, competitionId, ...ctx }) {
    requireCompetitionId("football.fixture-check", competitionId);
    const year = apiYear(ctx.season);
    const { data: competition, error: competitionError } = await db.from("competitions").select("id,name,provider,external_id").eq("id", competitionId).maybeSingle();
    if (competitionError) throw competitionError;
    if (!competition || competition.provider !== "apifootball" || !competition.external_id) return "Compétition absente ou incompatible API-Football : aucun appel API.";
    const { data: seasons, error: seasonError } = await db.from("seasons").select("id,label").eq("competition_id", competition.id);
    if (seasonError) throw seasonError;
    const candidates = (seasons || []).filter((season) => /^(19\d{2}|20\d{2})(?:-(19\d{2}|20\d{2}))?$/.test(String(season.label || "").trim()) && String(season.label).trim().slice(0, 4) === year);
    if (candidates.length > 1) throw new Error("Plusieurs saisons Belfoot correspondent à cette année : comparaison refusée avant appel API.");
    const season = candidates[0] || null;
    let stored = [];
    if (season) {
      const result = await readAll(() => db.from("matches").select("id,source,external_id,kickoff").eq("competition_id", competition.id).eq("season_id", season.id));
      if (result.error) throw result.error;
      stored = result.data || [];
    }
    const provider = getProvider("apifootball");
    if (!provider?.fetchMatches) throw new Error("Fournisseur API-Football indisponible : aucun appel API.");
    const fixtures = await provider.fetchMatches(competition, { ...ctx, season: year, providerAttempts: 1 });
    if (!Array.isArray(fixtures)) throw new Error("Réponse des matchs fournisseur invalide : comparaison impossible.");
    const ids = new Set(stored.filter((item) => item.source === "apifootball" && item.external_id != null).map((item) => String(item.external_id)));
    const invalid = fixtures.filter((item) => !item?.external_id);
    const unique = new Map();
    let duplicates = 0;
    for (const item of fixtures) {
      if (!item?.external_id) continue;
      const id = String(item.external_id);
      if (unique.has(id)) duplicates += 1;
      else unique.set(id, item);
    }
    const usable = [...unique.values()];
    const missing = season ? usable.filter((item) => !ids.has(String(item.external_id))) : [];
    const now = ctx.now == null ? Date.now() : Number(ctx.now);
    const upcoming = (item) => Number.isFinite(Date.parse(item.kickoff || "")) && Date.parse(item.kickoff) >= now;
    const examples = missing.filter(upcoming).sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff))).slice(0, 6)
      .map((item) => `${String(item.kickoff).slice(0, 10)} ${item.home_name || "?"}–${item.away_name || "?"} (${item.round || "tour inconnu"})`);
    const parts = [`${competition.name || "Compétition"} · saison API ${year}`, `fournisseur : ${fixtures.length} match(s), dont ${fixtures.filter(upcoming).length} à venir`];
    if (!season) parts.push("saison correspondante absente de Belfoot : comparaison impossible");
    else parts.push(`Belfoot ${season.label} : ${stored.length} match(s), ${missing.length} identifiant(s) fournisseur non trouvés dans cette saison, dont ${missing.filter(upcoming).length} à venir`);
    if (invalid.length) parts.push(`${invalid.length} match(s) fournisseur sans identifiant, non comparables`);
    if (duplicates) parts.push(`${duplicates} identifiant(s) fournisseur en double, comptés une seule fois`);
    if (examples.length) parts.push(`exemples à venir non trouvés : ${examples.join(" ; ")}`);
    parts.push("aucune écriture sportive");
    return parts.join(" · ");
  },
};
export default fixtureCheckJob;
