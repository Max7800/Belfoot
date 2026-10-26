// Libellé français d'une phase de compétition. L'API renvoie des noms anglais
// (« Regular Season », « Round of 16 », « 2nd Qualifying Round », « Group A »…) :
// on les traduit à l'affichage seulement — la valeur stockée reste la clé de
// regroupement des matchs (filtres, onglets, URL).
const ORDINALS = { 1: "1er", 2: "2e", 3: "3e", 4: "4e", 5: "5e", 6: "6e", 7: "7e", 8: "8e" };
const ordinal = (value) => ORDINALS[value] || `${value}e`;

const RULES = [
  [/^regular season$/i, () => "Saison régulière"],
  [/^league stage$/i, () => "Phase de ligue"],
  [/^group stage$/i, () => "Phase de groupes"],
  [/^groups?\s+([a-z0-9]{1,2})$/i, (m) => `Groupe ${m[1].toUpperCase()}`],
  [/^league\s+([a-d])$/i, (m) => `Ligue ${m[1].toUpperCase()}`],
  [/^championship (round|group)$/i, () => "Play-offs du titre"],
  [/^relegation (round|group)$/i, () => "Play-downs"],
  [/^conference league play-?off group$/i, () => "Play-offs Conference League"],
  [/^conference league group$/i, () => "Groupe Conference League"],
  [/^conference league play-?offs?\s*-\s*final$/i, () => "Barrage Conference League · finale"],
  [/^promotion play-?offs?\s*-\s*(.+)$/i, (m) => `Barrages de promotion · ${phaseLabel(m[1]).toLowerCase()}`],
  [/^ranking of second-placed teams$/i, () => "Classement des deuxièmes"],
  [/^(\d+)(?:st|nd|rd|th) qualifying round$/i, (m) => `${ordinal(m[1])} tour de qualification`],
  [/^qualifying round$/i, () => "Tour de qualification"],
  [/^preliminary round$/i, () => "Tour préliminaire"],
  [/^elite round$/i, () => "Tour Élite"],
  [/^playoff round$/i, () => "Barrages"],
  [/^play-?offs?$/i, () => "Barrages"],
  [/^play-?offs?\s+([a-d])\/([a-d])$/i, (m) => `Barrages ${m[1].toUpperCase()}/${m[2].toUpperCase()}`],
  [/^(\d+)(?:st|nd|rd|th) round$/i, (m) => `${ordinal(m[1])} tour`],
  [/^round (\d+)$/i, (m) => `${ordinal(m[1])} tour`],
  [/^round of 128$/i, () => "64es de finale"],
  [/^round of 64$/i, () => "32es de finale"],
  [/^round of 32$/i, () => "16es de finale"],
  [/^round of 16$/i, () => "8es de finale"],
  [/^quarter-?finals?$/i, () => "Quarts de finale"],
  [/^semi-?finals?$/i, () => "Demi-finales"],
  [/^3rd place final$/i, () => "Match pour la 3e place"],
  [/^final$/i, () => "Finale"],
  [/^friendlies(?:\s+(\d+))?$/i, (m) => (m[1] ? `Matchs amicaux ${m[1]}` : "Matchs amicaux")],
  [/^non-fifa friendlies$/i, () => "Matchs amicaux (hors FIFA)"],
  [/^friendly international women$/i, () => "Amicaux internationaux féminins"],
  [/^friendly international$/i, () => "Amicaux internationaux"],
];

export function phaseLabel(phase) {
  const text = String(phase ?? "").trim();
  if (!text) return phase;
  for (const [pattern, label] of RULES) {
    const match = text.match(pattern);
    if (match) return label(match);
  }
  // « Qualification - Round 1 - League A », « Round 2 - League A » : parties traduites une à une.
  if (/\s-\s/.test(text)) return text.split(/\s+-\s+/).map((part) => (/^qualification$/i.test(part) ? "Qualifications" : phaseLabel(part))).join(" · ");
  return text;
}
