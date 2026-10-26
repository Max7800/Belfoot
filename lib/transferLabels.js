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
