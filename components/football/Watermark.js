// Filigrane décoratif (monochrome, teinté à l'accent de la tuile) — ballon / chaussure / gant.
export default function Watermark({ kind, color }) {
  const s = { fill: color, opacity: 0.12 };
  if (kind === "ball") return <svg viewBox="0 0 24 24" className="h-28 w-28"><circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="1.6" opacity="0.18" /><path d="M12 6.2l4 2.9-1.5 4.6h-5L8 9.1z" style={s} /></svg>;
  if (kind === "boot") return <svg viewBox="0 0 24 24" className="h-28 w-28"><path d="M2 8h7l1.6 5 6.4 1c1.8.3 3 1.7 3 3.4V19H2z" style={s} /></svg>;
  if (kind === "glove") return <svg viewBox="0 0 24 24" className="h-28 w-28"><path d="M7 11V5.5a1.5 1.5 0 013 0V10h1V4.5a1.5 1.5 0 013 0V10h1V6.5a1.5 1.5 0 013 0V13c0 3.3-2.2 5.5-5.5 5.5H11c-2.2 0-4-1.8-4-4.5v-1L5 11a1.4 1.4 0 012-2z" style={s} /></svg>;
  return null;
}
