export function normalizeZones(zones) {
  if (!Array.isArray(zones)) return [];
  return zones.filter((zone) => {
    const from = Number(zone?.from); const to = Number(zone?.to);
    return Number.isFinite(from) && Number.isFinite(to) && from > 0 && to >= from;
  }).map((zone) => ({ ...zone, from: Number(zone.from), to: Number(zone.to) }));
}

// Dès qu'une saison possède la nouvelle configuration, aucune zone d'une autre
// phase/saison n'est héritée. Sans migration 0015, on conserve seulement les
// anciennes zones sur la phase principale pour assurer une transition propre.
export function zonesForPhase(competition, season, phase, primaryPhase) {
  if (season && season.zones_by_phase !== undefined) {
    const configured = season.zones_by_phase && typeof season.zones_by_phase === "object" && !Array.isArray(season.zones_by_phase)
      ? season.zones_by_phase[phase]
      : null;
    return normalizeZones(configured);
  }
  return phase === primaryPhase ? normalizeZones(competition?.zones) : [];
}

export function zoneAt(zones, position) {
  return normalizeZones(zones).find((zone) => position >= zone.from && position <= zone.to);
}
