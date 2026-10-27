// Libellé français du type de transfert. API-Football range dans `type` soit un
// montant (« € 20.5M »), soit un mot anglais (« Loan », « Free agent »,
// « Transfer », « Back from Loan »…), soit « N/A ». Le montant reste tel quel ;
// une valeur vide ou « N/A » ne s'affiche pas (null).
const RULES = [
  [/^(back|return(ed)?) from loan$|^end of loan$|^loan return$/i, "Retour de prêt"],
  [/loan|prêt|pret/i, "Prêt"],
  [/^free( agent| transfer)?$|^libre$/i, "Libre"],
  [/^transfer$/i, "Transfert"],
  [/^swap$/i, "Échange"],
];

export function transferTypeLabel(type) {
  const text = String(type ?? "").trim();
  if (!text || /^(n\/a|-|\?)$/i.test(text)) return null;
  return RULES.find(([pattern]) => pattern.test(text))?.[1] || text;
}

// Doublons de l'API : le même transfert (même joueur, mêmes clubs) revient à
// quelques jours d'écart (« K. Borys, Westerlo → Śląsk », 7 et 8 septembre) et
// la synchro le garde (identifiant = joueur + date + clubs). On n'en affiche
// qu'un : le plus ancien de chaque série rapprochée (moins de 30 jours).
const DUPLICATE_WINDOW_MS = 30 * 86400000;
const side = (id, name) => id || String(name || "").trim().toLowerCase() || "?";

export function dedupeTransfers(rows = []) {
  const kept = new Map();
  const ordered = [...rows].sort((a, b) => String(a.transfer_date || "").localeCompare(String(b.transfer_date || "")));
  const out = new Set();
  for (const row of ordered) {
    const key = [side(row.player_id, row.player_name), side(row.from_club_id, row.from_club_name), side(row.to_club_id, row.to_club_name)].join("|");
    const previous = kept.get(key);
    const time = Date.parse(row.transfer_date || "");
    if (previous && Number.isFinite(time) && time - previous.time < DUPLICATE_WINDOW_MS) continue;
    kept.set(key, { time: Number.isFinite(time) ? time : -Infinity });
    out.add(row);
  }
  return rows.filter((row) => out.has(row));
}
