export default function SaveStatus({ status }) {
  if (status === "saving") return <span className="text-xs text-muted">Enregistrement…</span>;
  if (status === "saved") return <span className="text-xs text-green-400">Enregistré ✓</span>;
  if (status === "error") return <span className="text-xs text-red-400">Erreur</span>;
  return null;
}
