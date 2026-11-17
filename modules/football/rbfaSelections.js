import sanitizeHtml from "sanitize-html";

// Pages publiques de la fédération : un instantané de joueurs, sans date
// explicite de publication ni garantie de lien avec une annonce donnée.
export const RBFA_SELECTION_SOURCES = {
  senior: "https://static.rbfa.be/project/publiek/rencintstat/spelers_fr_145.htm",
  u21: "https://static.rbfa.be/project/publiek/rencintstat/spelers_fr_141.htm",
};

const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function birthDate(day, month, year) {
  const value = `${year}-${month}-${day}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function parseRbfaSelection(html, { minimum = 11, maximum = 60 } = {}) {
  if (typeof html !== "string" || html.length > 512000) throw new Error("Document RBFA invalide ou trop volumineux");
  const players = [];
  // La page officielle contient des balises CENTER/A mal imbriquées : le
  // parseur HTML ferme parfois le lien avant le nom. On analyse donc la sortie
  // assainie, en exigeant un nom, une date et un club après chaque lien joueur.
  const clean = sanitizeHtml(html, {
    allowedTags: ["a", "br"],
    allowedAttributes: { a: ["href"] },
  });
  const links = [...clean.matchAll(/<a href="\/project\/publiek\/jrinterfr\/speler_PH_(\d+)\.htm">/gi)];
  const pattern = /<a href="\/project\/publiek\/jrinterfr\/speler_PH_(\d+)\.htm"><\/a>\s*<br\s*\/?>\s*([^<]{1,160})<br\s*\/?>\s*(\d{2})-(\d{2})-(\d{4})\s*<br\s*\/?>\s*([^<]{1,160})<br\s*\/?>/gi;
  for (const match of clean.matchAll(pattern)) {
    const born = birthDate(match[3], match[4], match[5]);
    if (!born) throw new Error("Date de naissance RBFA invalide");
    const name = match[2].replace(/\s+/g, " ").trim();
    const club = match[6].replace(/\s+/g, " ").trim();
    if (!name || !club) throw new Error("Joueur RBFA incomplet");
    players.push({ sourceId: match[1], name, birthDate: born, club });
  }
  if (links.length !== players.length || players.length < minimum || players.length > maximum || new Set(players.map((row) => row.sourceId)).size !== players.length) {
    throw new Error("Liste RBFA incomplète ou ambiguë ; aucune comparaison fiable");
  }
  return players;
}

// Même date de naissance ET nom cohérent, puis unicité des deux côtés :
// aucun rapprochement automatique sur le seul nom ou sur un homonyme.
export function compareRbfaSelection(official = [], players = [], activePlayerIds = []) {
  const mappings = [];
  const unresolved = [];
  const byPlayer = new Map();
  for (const person of official) {
    const officialName = normalize(person.name).split(" ");
    const candidates = players.filter((player) => {
      if (!player?.id || String(player.birth_date || "").slice(0, 10) !== person.birthDate) return false;
      const name = normalize(player.name).split(" ");
      return name[0]?.[0] === officialName[0]?.[0] && name.at(-1) === officialName.at(-1);
    });
    if (candidates.length !== 1) { unresolved.push({ ...person, reason: candidates.length ? "identité ambiguë" : "aucune identité vérifiée" }); continue; }
    const match = { official: person, playerId: candidates[0].id, playerName: candidates[0].name };
    mappings.push(match);
    byPlayer.set(match.playerId, (byPlayer.get(match.playerId) || 0) + 1);
  }
  const ambiguousIds = new Set([...byPlayer].filter(([, count]) => count > 1).map(([id]) => id));
  const verified = mappings.filter((row) => !ambiguousIds.has(row.playerId));
  for (const row of mappings.filter((item) => ambiguousIds.has(item.playerId))) unresolved.push({ ...row.official, reason: "plusieurs joueurs associés à la même fiche" });
  const current = new Set(activePlayerIds);
  const officialIds = new Set(verified.map((row) => row.playerId));
  return {
    matched: verified,
    unresolved,
    additions: verified.filter((row) => !current.has(row.playerId)),
    // Ne jamais conclure qu'un joueur est absent si une identité reste inconnue.
    removals: unresolved.length ? null : [...current].filter((id) => !officialIds.has(id)),
    complete: official.length > 0 && unresolved.length === 0,
  };
}
