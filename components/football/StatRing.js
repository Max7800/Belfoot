// Anneau de pourcentage (widgets statistiques joueur et équipe).
export default function StatRing({ value, label, tone = "rgb(var(--accent))", size = 64, text }) {
  const radius = 15.5;
  const circumference = 2 * Math.PI * radius;
  const filled = value == null ? 0 : Math.max(0, Math.min(100, value));
  return <div className="flex flex-col items-center gap-1">
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden><circle cx="18" cy="18" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" /><circle cx="18" cy="18" r={radius} fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(filled / 100) * circumference} ${circumference}`} /></svg>
      <b className="absolute inset-0 flex items-center justify-center text-sm tabular-nums">{text ?? (value == null ? "–" : `${value}%`)}</b>
    </span>
    {label && <span className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>}
  </div>;
}
