import { getAdmin } from "@/lib/supabaseAdmin";
import { runJob } from "@/lib/jobs";
import { refreshSeasonFor } from "@/lib/competitionRefresh";
import { updateSiteSettings } from "@/lib/siteSettings";
import { rosterRefreshDue } from "@/lib/jplHistory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
function authorized(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || request.headers.get("x-jobs-secret") || "";
  return [process.env.JOBS_SECRET, process.env.CRON_SECRET].filter(Boolean).includes(token);
}

export async function GET(request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const db = getAdmin();
  const start = Date.now();
  let enabled = false;
  try {
    const settings = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
    if (settings.error) throw settings.error;
    enabled = settings.data?.data?.football_jpl_history_enabled === true;
    if (!enabled) return Response.json({ ok: true, skipped: true, reason: "Automatisation désactivée" });
    const competitions = await db.from("competitions").select("id,name,provider,external_id,public_visible").eq("provider", "apifootball").eq("external_id", "144");
    if (competitions.error) throw competitions.error;
    const visible = (competitions.data || []).filter((item) => item.public_visible !== false);
    if (visible.length !== 1) throw new Error(`Pro League introuvable ou ambiguë (${visible.length} compétition(s) visibles).`);
    const seasons = await db.from("seasons").select("*").eq("competition_id", visible[0].id);
    if (seasons.error) throw seasons.error;
    const season = refreshSeasonFor(seasons.data || []);
    if (!season) throw new Error("Aucune saison publique trouvée pour la Pro League.");
    // Un passage hebdomadaire des effectifs détecte les arrivées même sans
    // match récent. Un club au plus par heure et reprise après interruption.
    const storedRoster = settings.data?.data?.football_jpl_roster_state || {};
    const rosterState = storedRoster.season === season.label ? storedRoster : {};
    let roster = null;
    if (rosterRefreshDue(rosterState, start)) {
      try {
        const startClub = Number(rosterState.clubIndex) || 0;
        const result = await runJob("football.squads", { db, competitionId: visible[0].id, season: season.label, clubBatchSize: 1, requestLimit: 4, providerTimeoutMs: 8000, resumeState: { competitionIndex: 0, clubIndex: startClub }, apifootballKey: process.env.APIFOOTBALL_KEY });
        if (!result.complete && !(Number(result.progress?.current) > startClub)) throw new Error("Le lot d'effectif n'a pas avancé.");
        const { error: _previousError, ...cleanState } = rosterState;
        roster = result.complete ? { season: season.label, clubIndex: 0, completedAt: new Date().toISOString() } : { ...cleanState, season: season.label, clubIndex: Number(result.progress.current) };
        await updateSiteSettings(db, { football_jpl_roster_state: roster });
      } catch (error) {
        roster = { ...rosterState, season: season.label, error: String(error?.message || error).slice(0, 200) };
        await updateSiteSettings(db, { football_jpl_roster_state: roster });
      }
    }
    // Un appel provider peut prendre 12 s ; ne pas en commencer après 25 s.
    if (Date.now() - start > 25000) {
      const last = { at: new Date().toISOString(), ok: !roster?.error, deferred: true, roster, detail: roster?.error ? `Effectif : ${roster.error}` : "Effectif mis à jour ; historiques reportés au prochain passage." };
      await updateSiteSettings(db, { football_jpl_history_last: last });
      return Response.json(last);
    }
    // runJob vérifie le plan d'import, les migrations, le quota et le verrou.
    const result = await runJob("football.division-history", { db, competitionId: visible[0].id, season: season.label, requestLimit: 5, deadline: start + 40000, apifootballKey: process.env.APIFOOTBALL_KEY });
    const currentRoster = roster || rosterState;
    const rosterReady = Boolean(currentRoster.completedAt) && !Number(currentRoster.clubIndex) && !currentRoster.error;
    const rosterDetail = roster?.error ? ` · Effectif : ${roster.error}` : !rosterReady ? " · vérification des effectifs en cours" : "";
    const last = { at: new Date().toISOString(), ok: !roster?.error, complete: result.complete && rosterReady, progress: result.progress, detail: `${result.detail || ""}${rosterDetail}`, requests: result.requests, roster };
    await updateSiteSettings(db, { football_jpl_history_last: last });
    return Response.json(last);
  } catch (error) {
    const last = { at: new Date().toISOString(), ok: false, error: String(error?.message || error).slice(0, 300) };
    if (enabled) await updateSiteSettings(db, { football_jpl_history_last: last }).catch(() => {});
    return Response.json(last, { status: 500 });
  }
}

export const POST = GET;
