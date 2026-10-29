// Page Transferts d'une compétition : sens, nature et bilan par club.
//
// Constats de l'audit du 28/10/2026 (784 transferts 2026, Pro League) :
// « Return from loan » affiché « Prêt », « - » et « End of career » affichés
// « Définitif » ; aucun montant fourni par l'API (le podium des montants ne
// s'affichait jamais) ; club d'arrivée parfois remplacé par le nom du joueur
// (« Tanghe Anton », « Kone Arouna ») ; liste à plat de plusieurs centaines de lignes.
import { transferTypeLabel } from "./transferLabels";
import { decodeEntities } from "./mojibake";
import { frenchClubName } from "./frenchClubs";

const words = (value) => String(value || "").toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [];

// Nature du mouvement, d'après le type API.
export function transferKind(type) {
  const label = transferTypeLabel(type);
  if (label === "Retour de prêt") return "loan_return";
  if (label === "Prêt") return "loan";
  if (label === "Libre") return "free";
  if (label === "Fin de carrière") return "end";
  if (label === "Transfert" || /[€$£]/.test(String(type || ""))) return "transfer";
  return "unknown";
}

// Club « fantôme » : l'API met « Nom Prénom » du joueur à la place du club.
// Deux formes relevées sur 91 cas : les mêmes mots dans un autre ordre
// (« Arouna Kone » → « Kone Arouna »), ou le nom de famille suivi du prénom
// quand la fiche n'a que l'initiale (« A. Tanghe » → « Tanghe Anton »,
// « B. Yameogo » → « Yameogo Abdoul », deux prénoms au plus : « K. Lokembo » →
// « Lokembo Lokaso Kilian »). Un vrai club qui partage un mot avec
// le joueur (« K. Union » / « Union St. Gilloise ») n'a pas cette forme.
const CLUB_WORDS = new Set(["united", "city", "club", "sporting", "athletic", "athletico", "real", "town", "rovers", "wanderers", "academy", "utd", "royal", "racing", "olympic", "olympique", "union", "gilloise", "sport", "sports", "calcio", "futuro", "reserves", "women", "youth",
  "st", "fc", "ac", "sc", "kv", "sv", "fk", "nk", "sk", "bk", "if", "ff", "cf", "cd", "us", "as", "ud", "sd", "rc", "ca", "ec", "se", "ks", "cs", "vv", "bv", "jk", "il", "sl"]);
const firstNameLike = (word) => word.length >= 2 && !/\d/.test(word) && !CLUB_WORDS.has(word);

export function isPlayerNamedClub(clubName, playerName) {
  const club = words(clubName);
  const all = words(playerName);
  const player = all.filter((word) => word.length > 1);
  if (!club.length || !player.length) return false;
  const sameWords = club.length === player.length && player.every((word) => club.includes(word));
  const surnameThenFirstName = all.length > player.length && club.length > player.length && club.length <= player.length + 2 && player.every((word, index) => club[index] === word) && club.slice(player.length).every(firstNameLike);
  return sameWords || surnameThenFirstName;
}

// Nom de club affiché : « Sans club » quand l'API a mis le nom du joueur ou rien.
// Un club relié en base (identifiant connu) n'est jamais un club fantôme.
// Noms bruts des transferts (texte de l'API) : en français comme les clubs.
export function clubLabel(name, playerName, clubId = null) {
  if (!String(name || "").trim() || (!clubId && isPlayerNamedClub(name, playerName))) return null;
  return frenchClubName(String(name).trim());
}

// Sens vu de la compétition : arrivée, départ, entre deux de ses clubs, ou autre.
export function transferDirection(transfer, clubIds) {
  const arriving = Boolean(transfer.to_club_id) && clubIds.has(transfer.to_club_id);
  const leaving = Boolean(transfer.from_club_id) && clubIds.has(transfer.from_club_id);
  if (arriving && leaving) return "internal";
  if (arriving) return "in";
  if (leaving) return "out";
  return "other";
}

// Entités HTML des transferts déjà stockés (« M. N&apos;Diaye ») : décodées à
// l'affichage ; les nouvelles lectures de l'API arrivent décodées (lib/mojibake.js).
export { decodeEntities };

// Club identique des deux côtés (« Philippe Bibout, KVC Westerlo → KVC Westerlo »,
// 6 cas relevés) : pas un mouvement, écarté.
const sameClub = (transfer) => (transfer.from_club_id && transfer.from_club_id === transfer.to_club_id)
  || (!transfer.from_club_id && !transfer.to_club_id && String(transfer.from_club_name || "").trim() !== "" && transfer.from_club_name === transfer.to_club_name);

// Lignes décorées, bilan global et bilan par club de la compétition.
export function summarizeTransfers(rows = [], clubIds = new Set()) {
  const items = rows.filter((transfer) => !sameClub(transfer)).map((raw) => ({ ...raw, player_name: decodeEntities(raw.player_name), from_club_name: decodeEntities(raw.from_club_name), to_club_name: decodeEntities(raw.to_club_name) })).map((transfer) => ({
    ...transfer,
    dir: transferDirection(transfer, clubIds),
    kind: transferKind(transfer.transfer_type),
    label: transferTypeLabel(transfer.transfer_type),
    from: clubLabel(transfer.from_club_name, transfer.player_name, transfer.from_club_id),
    to: clubLabel(transfer.to_club_name, transfer.player_name, transfer.to_club_id),
  }));
  const byClub = new Map([...clubIds].map((id) => [id, { clubId: id, arrivals: [], departures: [] }]));
  for (const item of items) {
    if (item.to_club_id && byClub.has(item.to_club_id)) byClub.get(item.to_club_id).arrivals.push(item);
    if (item.from_club_id && byClub.has(item.from_club_id)) byClub.get(item.from_club_id).departures.push(item);
  }
  const moving = items.filter((item) => item.dir !== "other");
  return {
    items,
    totals: {
      arrivals: items.filter((item) => item.dir === "in" || item.dir === "internal").length,
      departures: items.filter((item) => item.dir === "out" || item.dir === "internal").length,
      loans: moving.filter((item) => item.kind === "loan").length,
      free: moving.filter((item) => item.kind === "free").length,
    },
    // Clubs les plus actifs d'abord ; un club sans mouvement reste listé à la fin.
    clubs: [...byClub.values()].sort((a, b) => (b.arrivals.length + b.departures.length) - (a.arrivals.length + a.departures.length)),
  };
}

// Recherche de joueur ou de club, sans accents ni majuscules.
export function matchesTransferQuery(item, query) {
  const wanted = words(query);
  if (!wanted.length) return true;
  const haystack = words([item.player_name, item.from_club_name, item.to_club_name].join(" "));
  return wanted.every((word) => haystack.some((token) => token.startsWith(word)));
}
