export const ROSTER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function rosterRefreshDue(state = {}, now = Date.now()) {
  const last = Date.parse(state.completedAt || "");
  return Number(state.clubIndex) > 0 || !Number.isFinite(last) || now - last >= ROSTER_INTERVAL_MS;
}
