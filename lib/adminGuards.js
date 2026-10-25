// Garde-fous de l'administration générique (EntityManager) : suppressions et
// changements d'identité fournisseur annoncés avec leurs conséquences réelles,
// confirmés en tapant le nom, vérifiés et journalisés dans audit_log.

// Clés étrangères vers ces tables et leur règle ON DELETE (migrations football
// et votw, relevé du 25/10/2026). `blocks` : la base refuse la suppression.
export const DELETE_IMPACT = {
  competitions: [
    { table: "seasons", column: "competition_id", label: "saison(s)", effect: "supprimée(s) avec leurs données de couverture" },
    { table: "match_lineups", column: "competition_id", label: "ligne(s) de composition", effect: "supprimée(s)" },
    { table: "match_player_stats", column: "competition_id", label: "statistique(s) joueur par match", effect: "supprimée(s)" },
    { table: "match_team_stats", column: "competition_id", label: "statistique(s) d'équipe par match", effect: "supprimée(s)" },
    { table: "club_season_coverage", column: "competition_id", label: "couverture(s) club/saison", effect: "supprimée(s)" },
    { table: "matches", column: "competition_id", label: "match(s)", effect: "conservé(s) mais détaché(s) de toute compétition et saison" },
    { table: "player_season_stats", column: "competition_id", label: "ligne(s) de statistiques de carrière", effect: "détachée(s) de la compétition" },
    { table: "votw_sessions", column: "competition_id", label: "session(s) d'équipe de la semaine", effect: "détachée(s)" },
  ],
  seasons: [
    { table: "club_season_coverage", column: "season_id", label: "couverture(s) club/saison", effect: "supprimée(s)" },
    { table: "matches", column: "season_id", label: "match(s)", effect: "conservé(s) mais détaché(s) de la saison" },
    { table: "player_season_stats", column: "season_id", label: "ligne(s) de statistiques de carrière", effect: "détachée(s) de la saison" },
    { table: "votw_sessions", column: "season_id", label: "session(s) d'équipe de la semaine", effect: "détachée(s)" },
  ],
  clubs: [
    { table: "matches", column: "home_club_id", label: "match(s) à domicile", effect: "BLOQUENT la suppression", blocks: true },
    { table: "matches", column: "away_club_id", label: "match(s) à l'extérieur", effect: "BLOQUENT la suppression", blocks: true },
    { table: "player_team_seasons", column: "club_id", label: "affectation(s) de joueurs", effect: "supprimée(s)" },
    { table: "match_lineups", column: "club_id", label: "ligne(s) de composition", effect: "supprimée(s)" },
    { table: "match_team_stats", column: "club_id", label: "statistique(s) d'équipe par match", effect: "supprimée(s)" },
    { table: "national_team_callups", column: "national_team_id", label: "convocation(s) en sélection", effect: "supprimée(s)" },
    { table: "national_match_callups", column: "national_team_id", label: "convocation(s) par match", effect: "supprimée(s)" },
    { table: "club_season_coverage", column: "club_id", label: "couverture(s) club/saison", effect: "supprimée(s)" },
    { table: "players", column: "club_id", label: "joueur(s)", effect: "sans club actuel" },
    { table: "players", column: "national_team_id", label: "joueur(s) international(aux)", effect: "sans sélection" },
    { table: "coaches", column: "club_id", label: "entraîneur(s)", effect: "sans club" },
    { table: "clubs", column: "parent_club_id", label: "équipe(s) liée(s) (réserve, U23…)", effect: "sans club parent" },
    { table: "player_season_stats", column: "club_id", label: "ligne(s) de statistiques de carrière", effect: "détachée(s) du club" },
    { table: "match_events", column: "club_id", label: "événement(s) de match", effect: "détaché(s) du club" },
    { table: "match_player_stats", column: "club_id", label: "statistique(s) joueur par match", effect: "détachée(s) du club" },
    { table: "player_transfers", column: "from_club_id", label: "transfert(s) au départ", effect: "sans club de départ" },
    { table: "player_transfers", column: "to_club_id", label: "transfert(s) à l'arrivée", effect: "sans club d'arrivée" },
    { table: "votw_sessions", column: "national_team_id", label: "session(s) d'équipe de la semaine", effect: "détachée(s)" },
  ],
};

export const isGuardedDelete = (table) => Boolean(DELETE_IMPACT[table]);

export async function deleteImpact(db, table, id) {
  const rules = DELETE_IMPACT[table] || [];
  const counted = await Promise.all(rules.map(async (rule) => {
    const { count, error } = await db.from(rule.table).select("id", { count: "exact", head: true }).eq(rule.column, id);
    if (error) throw new Error(`Impact de la suppression impossible à mesurer (${rule.table}) : ${error.message}`);
    return { ...rule, count: count || 0 };
  }));
  const items = counted.filter((item) => item.count > 0);
  return { items, blocked: items.some((item) => item.blocks) };
}

export function deleteConfirmationText(singular, name, impact) {
  // Affiché seulement si rien ne bloque (sinon blockedDeleteText).
  const lines = impact.items.map((item) => `- ${item.count} ${item.label} : ${item.effect}`);
  return `Supprimer ${singular.toLowerCase()} « ${name} » ? Action IRRÉVERSIBLE.\n\n${lines.length ? `Conséquences :\n${lines.join("\n")}` : "Aucune donnée liée."}\n\nUne copie de la ligne est conservée dans le journal d'audit.\nTape le nom exact pour confirmer :`;
}

export function blockedDeleteText(singular, name, impact) {
  const lines = impact.items.filter((item) => item.blocks).map((item) => `- ${item.count} ${item.label}`);
  return `Suppression impossible : ${singular.toLowerCase()} « ${name} » est encore référencé(e) par :\n${lines.join("\n")}\n\nRéaffecte ou fusionne d'abord ces données. Rien n'a été supprimé.`;
}

// Champs d'identité fournisseur modifiés sur une ligne EXISTANTE.
export function identityChanges(original = {}, edited = {}, fields = []) {
  if (!edited.id) return [];
  return fields
    .filter((field) => String(original[field] ?? "") !== String(edited[field] ?? ""))
    .map((field) => ({ field, before: original[field] ?? null, after: edited[field] ?? null }));
}

export function identityConfirmationText(singular, name, changes) {
  const lines = changes.map((change) => `- ${change.field} : ${change.before ?? "(vide)"} → ${change.after ?? "(vide)"}`);
  return `Changer l'identité fournisseur de ${singular.toLowerCase()} « ${name} » ?\n\n${lines.join("\n")}\n\nLes prochaines synchronisations importeront les données de CETTE nouvelle cible dans la fiche existante (saisons, matchs et classements déjà présents restent rattachés). Une erreur ici mélange deux compétitions.\n\nTape le nom exact pour confirmer :`;
}

export const typedConfirmationMatches = (typed, name) => typeof typed === "string" && typed.trim() === String(name ?? "").trim() && String(name ?? "").trim() !== "";

export async function auditAdminAction(db, { action, table, id = null, meta = {} }) {
  const { data: { user } = {} } = await db.auth.getUser();
  const { error } = await db.from("audit_log").insert({ actor: user?.id || null, action, target_table: table, target_id: id, meta });
  return { error };
}
