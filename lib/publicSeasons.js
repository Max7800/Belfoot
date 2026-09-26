export function sortPublicSeasons(rows = []) {
  const hasRolloutState = rows.some((row) => Object.prototype.hasOwnProperty.call(row, "import_status"));
  const visibleRows = hasRolloutState
    ? rows.filter((row) => row.public_active || ["ready", "active"].includes(row.import_status))
    : rows;
  return [...visibleRows].sort((a, b) => {
    if (Boolean(a.public_active) !== Boolean(b.public_active)) return a.public_active ? -1 : 1;
    return String(b.label || "").localeCompare(String(a.label || ""));
  });
}

export function preferredPublicSeason(rows = []) {
  return sortPublicSeasons(rows)[0] || null;
}
