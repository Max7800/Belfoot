// Composition d'une équipe pour la fiche match (terrain + listes).
//
// Titulaires : les joueurs placés sur le terrain par l'API (grid « ligne:colonne »)
// font foi. Le drapeau `starter` venait aussi des statistiques joueurs, où
// l'API marque parfois tout l'effectif « non remplaçant » (constat du
// 27/10/2026 : 23 « titulaires » par équipe) ; il ne sert qu'à défaut de grid.
import { repairMojibake } from "./mojibake";

const parseGrid = (value) => {
  const match = /^(\d+):(\d+)$/.exec(String(value || "").trim());
  return match ? { line: Number(match[1]), column: Number(match[2]) } : null;
};

// Lettre de poste en français (API : G, D, M, F).
const POSITION_LETTERS = { G: "G", D: "D", M: "M", F: "A" };
export const positionLetter = (position) => POSITION_LETTERS[String(position || "").trim().toUpperCase()] || "";

const hex = (value) => (/^[0-9a-f]{6}$/i.test(String(value || "")) ? `#${value}` : null);

export function teamLineup({ rows = [], lineup = null } = {}) {
  // Note 0 de l’API = joueur non noté (remplaçant entré tard ou resté sur le banc).
  const players = rows.map((row) => ({ ...row, rating: Number(row.rating) > 0 ? Number(row.rating) : null, player_name: repairMojibake(row.player_name), placement: parseGrid(row.grid) }));
  const placed = players.filter((row) => row.placement);
  const starters = placed.length >= 7 ? placed : players.filter((row) => row.starter);
  const starterIds = new Set(starters.map((row) => row.id));
  const bench = players.filter((row) => !starterIds.has(row.id)).sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
  const byLine = new Map();
  for (const row of starters.filter((item) => item.placement)) {
    const list = byLine.get(row.placement.line) || [];
    list.push(row);
    byLine.set(row.placement.line, list);
  }
  const lines = [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list.sort((a, b) => a.placement.column - b.placement.column));
  const colors = lineup?.ext?.team?.colors || {};
  return {
    formation: lineup?.formation || null,
    coach: lineup?.ext?.coach?.name ? { name: repairMojibake(lineup.ext.coach.name), photo: lineup.ext.coach.photo || null } : null,
    starters: [...starters].sort((a, b) => (a.placement?.line ?? 99) - (b.placement?.line ?? 99) || (a.placement?.column ?? 99) - (b.placement?.column ?? 99) || (a.number ?? 99) - (b.number ?? 99)),
    bench,
    lines,
    colors: {
      player: { shirt: hex(colors.player?.primary), number: hex(colors.player?.number), border: hex(colors.player?.border) },
      goalkeeper: { shirt: hex(colors.goalkeeper?.primary), number: hex(colors.goalkeeper?.number), border: hex(colors.goalkeeper?.border) },
    },
  };
}

// Pastille de note pleine (lisible sur le terrain comme dans les listes).
export function ratingBadge(value) {
  const rating = Number(value);
  if (value == null || !Number.isFinite(rating)) return "bg-white/[0.08] text-muted";
  if (rating >= 8) return "bg-emerald-400 text-slate-950";
  if (rating >= 7) return "bg-lime-400 text-slate-950";
  if (rating >= 6) return "bg-amber-300 text-slate-950";
  return "bg-red-400 text-white";
}

// Précision d'un fait de match en français ; null si l'icône suffit
// (« Normal Goal », « Yellow Card »…).
const EVENT_DETAILS = [
  [/^normal goal$|^yellow card$|^red card$|^substitution \d+$/i, null],
  [/^own goal$/i, "contre son camp"],
  [/^penalty$/i, "penalty"],
  [/^missed penalty$/i, "penalty manqué"],
  [/^second yellow card$/i, "deuxième jaune"],
  [/^goal cancelled$/i, "but annulé"],
  [/^penalty confirmed$/i, "penalty confirmé"],
  [/^card upgrade$/i, "carton aggravé"],
];
export function eventDetailLabel(detail) {
  const text = String(detail ?? "").trim();
  if (!text) return null;
  const rule = EVENT_DETAILS.find(([pattern]) => pattern.test(text));
  return rule ? rule[1] : text;
}
