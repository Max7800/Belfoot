// Le suivi couvre cinq saisons AVANT la saison courante. Les marqueurs sont
// partagés entre les périmètres ; l'ancien marqueur « error » ne prouve pas
// qu'une saison a été importée.
export function historySeasons(now = new Date(), count = 5) {
  const current = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  return Array.from({ length: count }, (_, index) => String(current - count + index));
}

export function playerHistoryPlan(player, now = new Date()) {
  const status = player?.ext?.career_stats_seasons || {};
  const seasons = historySeasons(now);
  const missing = [];
  const failed = [];
  const complete = [];
  for (const season of seasons) {
    if (status[season] === "error") failed.push(season);
    else if (status[season]) complete.push(season);
    else missing.push(season);
  }
  return { seasons, missing, failed, complete, careerMissing: !player?.career_synced_at || player?.career_sync_status !== "ok" };
}
