import { LeaseLostError, newLeaseToken } from "@/lib/runLease";

// La base décide atomiquement si une saison peut être traitée. Une tâche déjà
// complète ou détenue par une autre exécution ne provoque aucun appel API.
export class HistoryBusyError extends Error {
  constructor() { super("Historique déjà en cours ou en attente de nouvelle tentative."); this.code = "HISTORY_BUSY"; }
}

export async function claimHistoryWork(db, playerId, season, { force = false } = {}) {
  const token = newLeaseToken();
  const { data, error } = await db.rpc("claim_player_history_work", { p_player: playerId, p_season: Number(season), p_token: token, p_force: force });
  if (error) throw error;
  if (data === true) return { token, state: "claimed" };
  const found = await db.from("player_history_work").select("state,lease_expires_at,last_error").eq("player_id", playerId).eq("season", Number(season)).maybeSingle();
  if (found.error) throw found.error;
  return { token: null, state: found.data?.state === "done" ? "done" : found.data?.state === "error" ? "error" : "busy", retryAfter: found.data?.lease_expires_at || null, error: found.data?.last_error || null };
}

export async function finishHistoryWork(db, playerId, season, token, errorMessage = null) {
  const { data, error } = await db.rpc("finish_player_history_work", { p_player: playerId, p_season: Number(season), p_token: token, p_error: errorMessage });
  if (error) throw error;
  if (data !== true) throw new LeaseLostError("Bail d'historique expiré ou repris : progression non acquittée.");
}

export async function patchHistoryMetadata(db, playerId, patch) {
  const { data, error } = await db.rpc("patch_player_history_metadata", { p_player: playerId, p_patch: patch });
  if (error) throw error;
  if (data !== true) throw new Error("Joueur introuvable lors de l'enregistrement de l'historique.");
}
