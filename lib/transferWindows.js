// Périodes vérifiées par association, catégorie et saison. Ne jamais extrapoler
// les dates aux saisons suivantes ni aux autres catégories de football.
const WINDOWS = [{
  provider: "apifootball", competitionIds: ["144", "145"], year: 2026,
  association: "Belgique", category: "football professionnel masculin",
  timeZone: "Europe/Brussels", source: "https://inside.fifa.com/fr/associations/BEL/snapshot", checkedAt: "2026-11-22",
  periods: [
    { id: "summer", label: "Été 2026", start: "2026-06-17", end: "2026-09-03" },
    { id: "winter", label: "Hiver 2027", start: "2027-01-02", end: "2027-02-03" },
  ],
}];

export function transferWindowsFor(competition, seasonYear) {
  return WINDOWS.find((item) => item.provider === competition?.provider && item.competitionIds.includes(String(competition?.external_id)) && item.year === Number(seasonYear)) || null;
}

export function dateInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function windowStatus(period, today) {
  if (today < period.start) return "upcoming";
  if (today <= period.end) return "open";
  return "closed";
}

export function transferWindowId(transfer, periods) {
  const value = transfer.transfer_date;
  if (transfer.transfer_date_uncertain || !/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "uncertain";
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "uncertain";
  return periods.find((period) => value >= period.start && value <= period.end)?.id || "outside";
}
