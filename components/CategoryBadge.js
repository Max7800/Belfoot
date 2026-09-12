export default function CategoryBadge({ name, color }) {
  if (!name) return null;
  const c = color || "#64748b";
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: c + "22", color: c }}>{name}</span>
  );
}
