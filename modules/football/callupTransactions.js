export async function atomicCallupsAvailable(db) {
  const { data, error } = await db.from("schema_migrations").select("version").eq("module", "football").eq("version", "0043_rbfa_callups_atomic").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function applyApiCallups(db, teamId, season, players) {
  const { data, error } = await db.rpc("apply_api_callups_atomic", { p_team: teamId, p_season: season, p_people: players });
  if (error) throw new Error(`Convocations API : ${error.message || String(error)}`);
  if (!data || typeof data.skipped !== "boolean") throw new Error("Convocations API : réponse transactionnelle invalide");
  return data;
}

export async function applyRbfaCallups(db, teamId, season, observedAt) {
  const { data, error } = await db.rpc("apply_rbfa_callups_atomic", { p_team: teamId, p_season: season, p_observed_at: observedAt });
  if (error) throw new Error(`Convocations RBFA : ${error.message || String(error)}`);
  if (!data || !Number.isInteger(data.players)) throw new Error("Convocations RBFA : réponse transactionnelle invalide");
  return data;
}
