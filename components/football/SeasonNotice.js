import { seasonNotice } from "@/lib/seasonNotice";

// Affiche l'état de la saison (règle dans lib/seasonNotice.js).
export default function SeasonNotice(props) {
  const notice = seasonNotice(props);
  if (!notice) return null;
  return <p data-season-notice={notice.kind} className="mb-5 rounded-xl border border-line/15 bg-surface/40 p-3 text-sm leading-6 text-muted"><b className="text-content">{notice.title}</b> {notice.text}</p>;
}
