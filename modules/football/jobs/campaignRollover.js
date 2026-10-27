// Renouvellement automatique d'une campagne (lib/campaignRollover.js) :
// 1 appel pour lire les saisons de la ligue, puis, seulement si une nouvelle
// campagne « en cours » n'est pas encore importée (ou importée sans aucun
// match) : autorisation dans le plan pour CETTE compétition, import complet
// au niveau choisi pour la compétition (« Archive résultats » par défaut,
// ~4 appels), contrôles de publication et marquage
// « prête ». Jamais d'activation ni de publication : la saison par défaut et la
// visibilité d'une compétition surveillée restent des choix de l'administrateur.
//
// Résultat structuré (meta.status, enregistré par le cron) : ineligible,
// no-campaign, up-to-date, not-prepared, waiting (calendrier pas encore publié),
// incomplete (contrôles non satisfaits), ready.
import "@/modules/football/apifootball";
import { getProvider } from "../providers";
import { requireCompetitionId } from "@/lib/jobScope";
import { detectNewCampaign, planWithCampaign, rolloverEligibility, WAITING_RETRY_HOURS } from "@/lib/campaignRollover";
import { auditSeasonReadiness } from "@/lib/seasonReadiness";
import { updateSiteSettings } from "@/lib/siteSettings";
import { syncCompetition } from "../syncCompetition";

const result = (status, detail, extra = {}) => ({ detail, meta: { status, ...extra } });

async function campaignMatchCount(db, competitionId, label) {
  const { data: season, error } = await db.from("seasons").select("id").eq("competition_id", competitionId).eq("label", label).maybeSingle();
  if (error) throw error;
  if (!season) return 0;
  const { count, error: countError } = await db.from("matches").select("id", { count: "exact", head: true }).eq("season_id", season.id);
  if (countError) throw countError;
  return count || 0;
}

const campaignRolloverJob = {
  key: "football.campaign-rollover",
  async run({ db, competitionId, ...ctx }) {
    requireCompetitionId("football.campaign-rollover", competitionId);
    const { data: competition, error } = await db.from("competitions").select("*").eq("id", competitionId).maybeSingle();
    if (error) throw error;
    const { data: settings, error: settingsError } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
    if (settingsError) throw settingsError;
    const rawPlan = settings?.data?.football_import_plan || {};
    const ineligible = rolloverEligibility(competition, rawPlan);
    if (ineligible) return result("ineligible", `${competition?.name || "Compétition"} : ${ineligible} — aucun appel API.`);
    const hidden = competition.public_visible === false;

    const provider = getProvider("apifootball");
    const league = await provider.fetchLeagueSeasons(competition, ctx);
    const current = (league?.seasons || []).find((season) => season?.current === true);
    const announced = current ? detectNewCampaign({ competition, league }).label : null;
    const importedMatches = announced ? await campaignMatchCount(db, competition.id, announced) : null;
    const detection = detectNewCampaign({ competition, league, importedMatches });
    if (!detection.label) return result("no-campaign", `${competition.name} : ${detection.skip}.`);
    if (detection.upToDate) return result("up-to-date", `${competition.name} : ${detection.skip}.`, { label: detection.label });
    // Campagne terminée encore annoncée « en cours » : rien à importer.
    if (detection.ended) return result("no-campaign", `${competition.name} : ${detection.skip}.`, { label: detection.label });

    const next = planWithCampaign(rawPlan, detection.label, competition.id);
    if (next.skip) return result("not-prepared", `${competition.name} : campagne ${detection.label} détectée, non préparée (${next.skip}).`, { label: detection.label });
    if (next.changed) {
      // Plan relu à chaque tentative et écriture conditionnée par la révision
      // (lib/siteSettings.js) : rien d'autre dans site_settings n'est écrasé.
      let skipped = null;
      await updateSiteSettings(db, (latest) => {
        const merged = planWithCampaign(latest.football_import_plan || {}, detection.label, competition.id);
        skipped = merged.skip || null;
        return merged.skip ? null : { football_import_plan: merged.plan };
      });
      if (skipped) return result("not-prepared", `${competition.name} : campagne ${detection.label} détectée, non préparée (${skipped}).`, { label: detection.label });
    }

    const imported = await syncCompetition(db, competition, { ...ctx, season: detection.label, mode: "full" });

    // Saison annoncée sans calendrier : rien à contrôler, nouvel essai plus tard.
    const matches = await campaignMatchCount(db, competition.id, detection.label);
    if (!matches) return result("waiting", `${competition.name} : campagne ${detection.label} annoncée par l'API mais aucun match publié — nouvel essai dans ${WAITING_RETRY_HOURS} h.`, { label: detection.label, hidden });

    const { data: season, error: seasonError } = await db.from("seasons").select("id,label,import_status,public_active").eq("competition_id", competition.id).eq("label", detection.label).maybeSingle();
    if (seasonError) throw seasonError;
    if (!season) return result("incomplete", `${competition.name} : campagne ${detection.label} importée (${imported}) mais saison introuvable.`, { label: detection.label, hidden });
    const report = await auditSeasonReadiness(db, season.id);
    if (!report.ok) {
      const failed = report.checks.filter((check) => check.blocking && !check.ok).map((check) => `${check.label} (${check.detail})`).join(", ");
      return result("incomplete", `${competition.name} : campagne ${detection.label} importée, contrôles incomplets (${failed}) — non publiée. ${imported}`, { label: detection.label, hidden });
    }
    if (!season.public_active && ["draft", "importing", "error"].includes(season.import_status)) {
      const { error: readyError } = await db.from("seasons").update({ import_status: "ready" }).eq("id", season.id).eq("public_active", false);
      if (readyError) throw readyError;
    }
    const nextStep = hidden
      ? "compétition encore MASQUÉE : à publier (la rendre visible, puis activer la saison depuis la page Saisons)"
      : "à activer depuis la page Saisons";
    return result("ready", `${competition.name} : campagne ${detection.label} importée et PRÊTE — ${nextStep}. ${imported}`, { label: detection.label, hidden });
  },
};

export default campaignRolloverJob;
