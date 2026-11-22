import { PUBLIC_PLAYER_FIELDS } from "./publicFootballData";

// Fusionne les lectures simultanées, sans mettre les résultats durablement en
// cache : une nouvelle navigation peut retrouver les dernières données.
const inFlight = new WeakMap();
function share(db, key, build) {
  let pending = inFlight.get(db);
  if (!pending) { pending = new Map(); inFlight.set(db, pending); }
  if (pending.has(key)) return pending.get(key);
  const promise = Promise.resolve(build()).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

export function readFollowedPlayers(db) {
  return share(db, "players", () => db.from("players").select(`${PUBLIC_PLAYER_FIELDS},binational_watch:ext->binational_watch,birth:ext->birth,league_stats:ext->league_stats`).eq("tracked", true).eq("active", true));
}

export function readOverviewCompetitions(db) {
  return share(db, "competitions", () => db.from("competitions").select("*"));
}
