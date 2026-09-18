const LIVE_SHORT = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const FINISHED_SHORT = new Set(["FT", "AET", "PEN"]);
const POSTPONED_SHORT = new Set(["PST", "CANC", "ABD", "AWD", "WO"]);

function providerShort(match) {
  return String(match?.ext?.status_short || match?.ext?.fixture?.status?.short || "").toUpperCase();
}

export function isMatchLive(match) {
  return match?.status === "live" || LIVE_SHORT.has(providerShort(match));
}

export function isMatchFinished(match) {
  return match?.status === "finished" || FINISHED_SHORT.has(providerShort(match));
}

export function matchStatusMeta(match) {
  const short = providerShort(match);
  const minute = match?.minute ?? match?.ext?.elapsed ?? match?.ext?.fixture?.status?.elapsed ?? null;
  if (isMatchLive(match)) {
    if (short === "HT") return { key: "live", label: "Mi-temps", compact: "MT", live: true };
    if (["ET", "BT"].includes(short)) return { key: "live", label: minute ? `Prolongation · ${minute}'` : "Prolongation", compact: minute ? `${minute}'` : "PROL", live: true };
    if (short === "P") return { key: "live", label: "Tirs au but", compact: "TAB", live: true };
    if (["SUSP", "INT"].includes(short)) return { key: "live", label: "Interrompu", compact: "INT", live: true };
    return { key: "live", label: minute ? `En direct · ${minute}'` : "En direct", compact: minute ? `${minute}'` : "LIVE", live: true };
  }
  if (isMatchFinished(match)) return { key: "finished", label: short === "AET" ? "Terminé après prolongation" : short === "PEN" ? "Terminé aux tirs au but" : "Terminé", compact: short === "AET" ? "AP" : short === "PEN" ? "TAB" : "FIN" };
  if (match?.status === "postponed" || POSTPONED_SHORT.has(short)) return { key: "postponed", label: short === "CANC" ? "Annulé" : "Reporté", compact: short === "CANC" ? "ANN" : "REP" };
  const kickoff = match?.kickoff ? new Date(match.kickoff) : null;
  return { key: "scheduled", label: kickoff ? kickoff.toLocaleString("fr-BE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "À programmer", compact: kickoff ? kickoff.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }) : "—" };
}

export function sameLocalDay(dateValue, reference = new Date()) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth() && date.getDate() === reference.getDate();
}
