// Préparation en lecture seule. Ce plan n'est pas une autorisation d'écriture :
// un futur import doit vérifier les mêmes conditions en transaction en base et
// sérialiser aussi les imports API-Football concurrents.
export function planRbfaCallups({ officialCount, matched, existing, season }) {
  if (!Number.isInteger(officialCount) || officialCount < 11 || officialCount > 60 || !/^\d{4}-\d{4}$/.test(season || "")) return { ready: false, reason: "Liste ou saison invalide" };
  if (!Array.isArray(matched) || matched.length !== officialCount) return { ready: false, reason: "Certaines identités ne sont pas reliées" };
  const ids = matched.map((row) => row?.playerId);
  if (ids.some((id) => !id) || new Set(ids).size !== officialCount) return { ready: false, reason: "Identités manquantes ou ambiguës" };
  const wanted = new Set(ids);
  const rows = Array.isArray(existing) ? existing : [];
  const protectedRows = rows.filter((row) => row.locked || (row.source !== "apifootball" && row.source !== "rbfa"));
  const mutableRows = rows.filter((row) => !row.locked && (row.source === "apifootball" || row.source === "rbfa"));
  const additions = ids.filter((id) => !rows.some((row) => row.player_id === id && row.season === season));
  const reactivations = mutableRows.filter((row) => row.season === season && wanted.has(row.player_id) && !row.active).map((row) => row.id);
  const removals = mutableRows.filter((row) => row.active && !wanted.has(row.player_id)).map((row) => row.id);
  const protectedConflicts = protectedRows.filter((row) => (row.active && !wanted.has(row.player_id)) || (row.season === season && !row.active && wanted.has(row.player_id))).map((row) => row.id);
  return { ready: protectedConflicts.length === 0, reason: protectedConflicts.length ? "Des convocations manuelles ou verrouillées nécessitent une vérification" : null, additions, reactivations, removals, protectedConflicts };
}
