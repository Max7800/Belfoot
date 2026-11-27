// Identifiants RBFA publics vérifiés ; les listes décrivent le dernier état publié,
// sans date d'annonce explicite. Les catégories féminines de jeunes ne sont pas
// déduites d'un identifiant masculin voisin.
export const RBFA_SOURCES = {
  senior: { page: 145, team: "1", title: "Diables Rouges" },
  u21: { page: 141, team: "8183", title: "U21" },
  u19: { page: 139, team: "10327", title: "U19" },
  u18: { page: 138, team: "22425", title: "U18" },
  u17: { page: 137, team: "17942", title: "U17" },
  u16: { page: 136, team: "22496", title: "U16" },
  women: { page: 143, team: "1777", title: "Red Flames" },
};
export const rbfaSourceUrl = (category) => RBFA_SOURCES[category] ? `https://static.rbfa.be/project/publiek/rencintstat/spelers_fr_${RBFA_SOURCES[category].page}.htm` : null;
