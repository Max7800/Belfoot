// Statistiques des 5 saisons passées des Belges trouvés par le balayage des
// championnats (pipeline global « Saisons passées des Belges à l'étranger »),
// demandé le 28/10/2026 : le parcours montrait les clubs sans les matchs ni
// les buts de chaque saison.
//
// Un appel par joueur et par saison, seulement pour les saisons où son parcours
// montre un club (un joueur passé pro en 2024 ne coûte que 2 appels). Saison
// faite = notée dans ext.career_stats_seasons ; joueur terminé = ext.past_stats_done_at.
import { getProvider } from "./providers";
import { syncCareerSeasonStats } from "./syncPlayerCareers";
import { isLeaseLost } from "@/lib/runLease";

export const PAST_SEASONS = 5;
// Fonction Vercel coupée à 60 s : pas de nouvelle saison au-delà de 35 s (un lot de
// 5 joueurs × 5 saisons dépassait la limite, FUNCTION_INVOCATION_TIMEOUT le 28/10/2026).
export const SEASON_STATS_TIME_MS = 35000;

// Saisons passées, de la plus ancienne à la plus récente : « 2021 » … « 2025 » en octobre 2026.
export function pastSeasons(now = new Date(), count = PAST_SEASONS) {
  const current = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return Array.from({ length: count }, (_, index) => String(current - count + index));
}

// Saisons à demander : celles du parcours (toutes si le parcours est vide), pas encore faites.
export function seasonsToFetch(player, membershipYears = [], seasons = pastSeasons()) {
  const done = player?.ext?.career_stats_seasons || {};
  const known = new Set(membershipYears.map(String));
  return seasons.filter((season) => !done[season] && (!known.size || known.has(season)));
}

// Refus de l'API qui touche tous les joueurs (abonnement, quota) : on s'arrête
// sans rien marquer, pour reprendre plus tard au même endroit.
const BLOCKING = /plan|subscription|request limit|quota|429|budget api/i;

export async function syncBelgianSeasonStats(db, ctx = {}) {
  const provider = getProvider("apifootball");
  const competition = { provider: "apifootball", name: "Belges à l'étranger" };
  const seasons = ctx.seasons || pastSeasons(ctx.now || new Date());
  const batchSize = Math.max(1, Math.min(Number(ctx.batchSize) || 5, 10));
  const callLimit = Math.max(1, Number(ctx.requestLimit) || batchSize * seasons.length);
  const deadline = Number(ctx.deadline) || Date.now() + SEASON_STATS_TIME_MS;
  const remainingQuery = () => db.from("players").select("id", { count: "exact", head: true })
    .eq("tracked", true).eq("active", true).not("ext->league_stats", "is", null).is("ext->past_stats_done_at", null);

  const { data: players, error } = await db.from("players")
    .select("id,name,external_id,source,nationality,ext")
    .eq("tracked", true).eq("active", true).eq("source", "apifootball").not("external_id", "is", null)
    .not("ext->league_stats", "is", null).is("ext->past_stats_done_at", null)
    .order("id", { ascending: true }).limit(batchSize);
  if (error) throw error;

  let calls = 0;
  let lines = 0;
  let finished = 0;
  const errors = [];
  for (const player of players || []) {
    const { data: memberships, error: membershipsError } = await db.from("player_team_seasons").select("season_start_year").eq("player_id", player.id);
    if (membershipsError) throw membershipsError;
    let ext = { ...(player.ext || {}) };
    // Saisons à demander figées au premier passage : les stats écrites créent
    // elles-mêmes des affectations, qui fausseraient le parcours à la reprise.
    if (!Array.isArray(ext.past_stats_plan)) {
      ext = { ...ext, past_stats_plan: seasonsToFetch(player, (memberships || []).map((row) => row.season_start_year).filter(Boolean), seasons) };
    }
    const done = ext.career_stats_seasons || {};
    const todo = ext.past_stats_plan.filter((season) => !done[season]);
    let stopped = false;
    for (const season of todo) {
      if (calls >= callLimit || Date.now() >= deadline) { stopped = true; break; }
      calls++;
      try {
        lines += await syncCareerSeasonStats(db, provider, competition, player, { ...ctx, season });
        ext = { ...ext, career_stats_seasons: { ...(ext.career_stats_seasons || {}), [season]: new Date().toISOString() } };
      } catch (seasonError) {
        if (isLeaseLost(seasonError) || BLOCKING.test(String(seasonError?.message || seasonError))) throw seasonError;
        // Erreur propre à ce joueur et cette saison : notée, saison écartée.
        ext = { ...ext, career_stats_seasons: { ...(ext.career_stats_seasons || {}), [season]: "error" } };
        errors.push(`${player.name} ${season} : ${String(seasonError?.message || seasonError).slice(0, 80)}`);
      }
      // Avancement enregistré saison par saison : une coupure ne fait rien repayer.
      const { error: saveError } = await db.from("players").update({ ext }).eq("id", player.id);
      if (saveError) throw saveError;
    }
    if (stopped) break;
    ext = { ...ext, past_stats_done_at: new Date().toISOString() };
    const { error: doneError } = await db.from("players").update({ ext }).eq("id", player.id);
    if (doneError) throw doneError;
    finished++;
  }

  const { count } = await remainingQuery();
  const left = count || 0;
  return {
    detail: `${finished} Belge(s) complété(s), ${calls} saison(s) demandée(s), ${lines} ligne(s) de statistiques${errors.length ? ` · ${errors.length} erreur(s) : ${errors.join(" ; ")}` : ""}${left ? ` · ${left} joueur(s) restant(s)` : " · saisons passées à jour"}`,
    complete: left === 0,
    calls,
    progress: { current: finished, total: left + finished, unit: "joueurs" },
  };
}
