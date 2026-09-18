import { sanitizeRichHtml } from "@/lib/sanitizeRichHtml";

// Défense en profondeur : même les anciennes entrées et les imports JSON sont
// assainis au rendu, pas seulement les nouvelles contributions.
export default function RichContent({ html }) {
  if (!html) return null;
  return <div className="rich" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }} />;
}
