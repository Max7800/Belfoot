// Renouvellement automatique d'une campagne (lib/campaignRollover.js) :
// 1 appel pour lire les saisons de la ligue, puis, seulement si une nouvelle
// campagne « en cours » n'est pas encore importée : autorisation dans le plan
// pour CETTE compétition, import complet « Archive résultats » (~4 appels),
// contrôles de publication et marquage « prête ». Jamais d'activation : la
// saison par défaut reste choisie par l'administrateur.
import "@/modules/football/apifootball";
import { getProvider } from "../providers";
import { requireCompetitionId } from "@/lib/jobScope";
import { detectNewCampaign, planWithCampaign, rolloverEligibility } from "@/lib/campaignRollover";
import { auditSeasonReadiness } from "@/lib/seasonReadiness";
import { updateSiteSettings } from "@/lib/siteSettings";
import { syncCompetition } from "../syncCompetition";

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
    if (ineligible) return `${competition?.name || "Compétition"} : ${ineligible} — aucun appel API.`;

    const provider = getProvider("apifootball");
    const league = await provider.fetchLeagueSeasons(competition, ctx);
    const detection = detectNewCampaign({ competition, league });
    if (!detection.label || detection.upToDate) return `${competition.name} : ${detection.skip}.`;

    const next = planWithCampaign(rawPlan, detection.label, competition.id);
    if (next.skip) return `${competition.name} : campagne ${detection.label} détectée, non préparée (${next.skip}).`;
    if (next.changed) {
      // Plan relu à chaque tentative et écriture conditionnée par la révision
      // (lib/siteSettings.js) : rien d'autre dans site_settings n'est écrasé.
      let skipped = null;
      await updateSiteSettings(db, (current) => {
        const merged = planWithCampaign(current.football_import_plan || {}, detection.label, competition.id);
        skipped = merged.skip || null;
        return merged.skip ? null : { football_import_plan: merged.plan };
      });
      if (skipped) return `${competition.name} : campagne ${detection.label} détectée, non préparée (${skipped}).`;
    }

    const imported = await syncCompetition(db, competition, { ...ctx, season: detection.label, mode: "full" });

    const { data: season, error: seasonError } = await db.from("seasons").select("id,label,import_status,public_active").eq("competition_id", competition.id).eq("label", detection.label).maybeSingle();
    if (seasonError) throw seasonError;
    if (!season) return `${competition.name} : campagne ${detection.label} importée (${imported}) mais saison introuvable.`;
    const report = await auditSeasonReadiness(db, season.id);
    if (!report.ok) {
      const failed = report.checks.filter((check) => check.blocking && !check.ok).map((check) => `${check.label} (${check.detail})`).join(", ");
      return `${competition.name} : campagne ${detection.label} importée, contrôles incomplets (${failed}) — non publiée. ${imported}`;
    }
    if (!season.public_active && ["draft", "importing", "error"].includes(season.import_status)) {
      const { error: readyError } = await db.from("seasons").update({ import_status: "ready" }).eq("id", season.id).eq("public_active", false);
      if (readyError) throw readyError;
    }
    return `${competition.name} : campagne ${detection.label} importée et PRÊTE — à activer depuis le plan d'import. ${imported}`;
  },
};

export default campaignRolloverJob;
