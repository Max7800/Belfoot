import { LeaseLostError, newLeaseToken } from "@/lib/runLease";

// La base décide atomiquement si une saison peut être traitée. Une tâche déjà
// complète ou détenue par une autre exécution ne provoque aucun appel API.
export async function claimHistoryWork(db, playerId, season) {
  const token = newLeaseToken();
  const { data, error } = await db.rpc("claim_player_history_work", { p_player: playerId, p_season: Number(season), p_token: token });
  if (error) throw error;
  if (data === true) return { token, state: "claimed" };
  const found = await db.from("player_history_work").select("state").eq("player_id", playerId).eq("season", Number(season)).maybeSingle();
  if (found.error) throw found.error;
  return { token: null, state: found.data?.state === "done" ? "done" : "busy" };
}

export async function finishHistoryWork(db, playerId, season, token, errorMessage = null) {
  const { data, error } = await db.rpc("finish_player_history_work", { p_player: playerId, p_season: Number(season), p_token: token, p_error: errorMessage });
  if (error) throw error;
  if (data !== true) throw new LeaseLostError("Bail d'historique expiré ou repris : progression non acquittée.");
}
