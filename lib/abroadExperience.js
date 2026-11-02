// Comparaison tolérante aux accents pour la recherche, sans modifier les noms affichés.
export function searchText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr");
}

export function isRecentPerformance(match, now = Date.now(), maxDays = 45) {
  const date = Date.parse(match?.kickoff || "");
  return Number.isFinite(date) && date <= now && now - date <= maxDays * 86400000;
}

export function formatProviderCountry(value) {
  return String(value || "").replaceAll("-", " ");
}

// Le repli conserve le comportement existant tant que la migration n'est pas
// installée. Les autres erreurs doivent rester visibles au lieu d'être masquées.
export async function loadAbroadPerformances(db, playerIds, fields) {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return { data: [], limited: false };
  const all = [];
  for (let offset = 0; offset < ids.length; offset += 80) {
    const result = await db.rpc("abroad_recent_performances", { p_player_ids: ids.slice(offset, offset + 80) });
    if (result.error?.code === "PGRST202") {
      const fallback = await db.from("match_player_stats").select(fields).in("player_id", ids).order("synced_at", { ascending: false }).limit(500);
      if (fallback.error) throw fallback.error;
      return { data: fallback.data || [], limited: true };
    }
    if (result.error) throw result.error;
    all.push(...(result.data || []));
  }
  return { data: all, limited: false };
}
