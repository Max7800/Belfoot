// Reliaison SANS appel API des lignes restées sans joueur ou sans club.
//
// Héritage de P0-1 (correspondances tronquées à 1 000 lignes) : des performances
// (match_player_stats.player_id) et des matchs (home/away_club_id) ont été écrits
// sans lien alors que l'identifiant provider était stocké et que la fiche existe.
// Les matchs terminés étant marqués « traités », aucune synchronisation ne les
// répare. Ces fonctions relient à partir des identifiants déjà en base :
//   - jamais d'appel provider ;
//   - aperçu par défaut (apply = false) : rien n'est écrit ;
//   - seulement des valeurs vides (`is null`) : relancer ne fait rien de plus ;
//   - jamais une ligne verrouillée ;
//   - un identifiant qui correspond à 0 ou à plusieurs fiches n'est pas relié ;
//   - chaque lien posé est renvoyé (et journalisé par l'appelant) pour un retour
//     arrière exact.

const MAX_BATCH = 1000;
const chunk = (values, size) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, index * size + size));

async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

// Candidats par identifiant provider, SANS dédoublonner : plusieurs fiches pour
// un même identifiant = ambiguïté, jamais résolue au hasard.
async function candidatesByExternalId(db, table, source, externalIds, columns = "id,external_id") {
  const byExternalId = new Map();
  const ids = [...new Set(externalIds.filter(Boolean).map(String))];
  for (const batch of chunk(ids, 100)) {
    const { data, error } = await db.from(table).select(columns).eq("source", source).in("external_id", batch);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of data || []) (byExternalId.get(String(row.external_id)) || byExternalId.set(String(row.external_id), []).get(String(row.external_id))).push(row);
  }
  return byExternalId;
}

const resolveOne = (candidates) => (candidates?.length === 1 ? candidates[0] : null);

// Performances de match sans joueur relié.
// Lots successifs : passer le `nextAfterId` renvoyé comme `afterId` (sinon les lignes
// non réparables, restées en tête, seraient réexaminées indéfiniment).
export async function relinkMatchPlayerStats(db, { competitionId = null, limit = MAX_BATCH, apply = false, afterId = null } = {}) {
  const size = Math.max(1, Math.min(Number(limit) || MAX_BATCH, MAX_BATCH));
  let query = db.from("match_player_stats")
    .select("id,source,player_external_id,competition_id")
    .is("player_id", null)
    .not("player_external_id", "is", null)
    .eq("locked", false)
    .order("id")
    .limit(size);
  if (competitionId) query = query.eq("competition_id", competitionId);
  if (afterId) query = query.gt("id", afterId);
  const { data: rows, error } = await query;
  if (error) throw new Error(`match_player_stats: ${error.message}`);

  const report = { scanned: rows?.length || 0, linkable: 0, linked: 0, unresolved: 0, ambiguous: 0, links: [], nextAfterId: rows?.length ? rows[rows.length - 1].id : null, done: (rows?.length || 0) < size };
  const plan = new Map(); // player_id -> [performance ids]
  const bySource = new Map();
  for (const row of rows || []) (bySource.get(row.source) || bySource.set(row.source, []).get(row.source)).push(row);
  for (const [source, sourceRows] of bySource) {
    const candidates = await candidatesByExternalId(db, "players", source, sourceRows.map((row) => row.player_external_id));
    for (const row of sourceRows) {
      const found = candidates.get(String(row.player_external_id)) || [];
      if (found.length > 1) { report.ambiguous++; continue; }
      const player = resolveOne(found);
      if (!player) { report.unresolved++; continue; }
      report.linkable++;
      (plan.get(player.id) || plan.set(player.id, []).get(player.id)).push(row.id);
    }
  }
  const planned = [...plan.entries()].flatMap(([playerId, ids]) => ids.map((id) => ({ id, player_id: playerId })));
  if (!apply) return { ...report, links: planned };
  report.links = await applyPlayerStatLinks(db, planned);
  report.linked = report.links.length;
  return report;
}

// Applique des liens déjà planifiés (et journalisés par l'appelant) : seulement
// si la performance est toujours sans joueur et non verrouillée. Renvoie les
// liens réellement posés.
export async function applyPlayerStatLinks(db, links = []) {
  const byPlayer = new Map();
  for (const link of links) (byPlayer.get(link.player_id) || byPlayer.set(link.player_id, []).get(link.player_id)).push(link.id);
  const applied = [];
  await mapWithConcurrency([...byPlayer.entries()], 8, async ([playerId, ids]) => {
    for (const batch of chunk(ids, 200)) {
      const { data, error } = await db.from("match_player_stats")
        .update({ player_id: playerId })
        .in("id", batch)
        .is("player_id", null)
        .eq("locked", false)
        .select("id");
      if (error) throw new Error(`match_player_stats: ${error.message}`);
      for (const row of data || []) applied.push({ id: row.id, player_id: playerId });
    }
  });
  return applied;
}

// Matchs d'UNE compétition dont une équipe n'est pas reliée. La compétition est
// obligatoire : l'admin juge compétition par compétition (le rapport expose la
// ligue API des matchs pour repérer une compétition mal identifiée).
export async function relinkMatchClubs(db, { competitionId, limit = 500, apply = false, afterId = null } = {}) {
  if (!competitionId) throw new Error("Choisis la compétition à réparer");
  const size = Math.max(1, Math.min(Number(limit) || 500, MAX_BATCH));
  const { data: competition, error: competitionError } = await db.from("competitions").select("id,name,external_id,provider,ext").eq("id", competitionId).maybeSingle();
  if (competitionError) throw new Error(`competitions: ${competitionError.message}`);
  if (!competition) throw new Error("Compétition introuvable");
  let matchesQuery = db.from("matches")
    .select("id,source,home_club_id,away_club_id,ext")
    .eq("competition_id", competitionId)
    .or("home_club_id.is.null,away_club_id.is.null")
    .eq("locked", false)
    .order("id")
    .limit(size);
  if (afterId) matchesQuery = matchesQuery.gt("id", afterId);
  const { data: matches, error } = await matchesQuery;
  if (error) throw new Error(`matches: ${error.message}`);

  const report = {
    competition: { id: competition.id, name: competition.name, externalId: competition.external_id, providerName: competition.ext?.providerName || null },
    scanned: matches?.length || 0, sidesEmpty: 0, linkable: 0, linked: 0, unresolved: 0, ambiguous: 0, noExternalId: 0,
    providerLeagues: {}, links: [], nextAfterId: matches?.length ? matches[matches.length - 1].id : null, done: (matches?.length || 0) < size,
  };
  const plan = [];
  const bySource = new Map();
  for (const match of matches || []) (bySource.get(match.source) || bySource.set(match.source, []).get(match.source)).push(match);
  for (const [source, sourceMatches] of bySource) {
    const externalIds = sourceMatches.flatMap((match) => [!match.home_club_id && match.ext?.home_ext, !match.away_club_id && match.ext?.away_ext]);
    const candidates = await candidatesByExternalId(db, "clubs", source, externalIds);
    for (const match of sourceMatches) {
      const league = `${match.ext?.league_ext ?? "?"} ${match.ext?.league_name ?? "?"}`;
      report.providerLeagues[league] = (report.providerLeagues[league] || 0) + 1;
      for (const side of ["home", "away"]) {
        if (match[`${side}_club_id`]) continue;
        report.sidesEmpty++;
        const externalId = match.ext?.[`${side}_ext`];
        if (!externalId) { report.noExternalId++; continue; }
        const found = candidates.get(String(externalId)) || [];
        if (found.length > 1) { report.ambiguous++; continue; }
        const club = resolveOne(found);
        if (!club) { report.unresolved++; continue; }
        report.linkable++;
        plan.push({ id: match.id, side, club_id: club.id });
      }
    }
  }
  if (!apply) return { ...report, links: plan };
  report.links = await applyMatchClubLinks(db, plan);
  report.linked = report.links.length;
  return report;
}

// Applique des liens de clubs déjà planifiés (et journalisés) : seulement si le
// côté est toujours vide et le match non verrouillé.
export async function applyMatchClubLinks(db, links = []) {
  const applied = [];
  await mapWithConcurrency(links, 8, async ({ id, side, club_id }) => {
    if (!["home", "away"].includes(side)) throw new Error(`matches/${id}: côté inconnu ${side}`);
    const column = `${side}_club_id`;
    const { data, error } = await db.from("matches").update({ [column]: club_id }).eq("id", id).is(column, null).eq("locked", false).select("id");
    if (error) throw new Error(`matches/${id}: ${error.message}`);
    if (data?.length) applied.push({ id, side, club_id });
  });
  return applied;
}
