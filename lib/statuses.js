// Statuts de fiabilité Belfoot (du plus sûr au démenti), avec code couleur.
// Réutilisable partout (mercato, scouting, annonces…).
export const BELFOOT_STATUSES = [
  { key: "Officiel", color: "#059669" },
  { key: "Confirmé", color: "#16a34a" },
  { key: "Très probable", color: "#65a30d" },
  { key: "Rumeur", color: "#d97706" },
  { key: "Incertain", color: "#64748b" },
  { key: "Démenti", color: "#dc2626" },
];

export const BELFOOT_STATUS_OPTIONS = BELFOOT_STATUSES.map((s) => s.key);

export function statusColor(name) {
  return BELFOOT_STATUSES.find((s) => s.key === name)?.color || "#64748b";
}

// Badge coloré (composant pur -> utilisable en page serveur comme client).
export function StatusBadge({ status, className = "" }) {
  if (!status) return null;
  const color = statusColor(status);
  return (
    <span style={{ color, borderColor: `${color}55`, backgroundColor: `${color}1a` }} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-black ${className}`}>
      {status}
    </span>
  );
}
