// Proposition à contrôler : ne modifie ni le palmarès ni les données en base.
// Les finales aller-retour sont retenues seulement si les deux manches sont identifiables.
export function cupWinnerCandidate({ competitionType, matches, complete = false } = {}) {
  const unknown = (reason) => ({ status: "needs_review", reason });
  if (competitionType !== "cup") return unknown("format_non_pris_en_charge");
  if (!complete || !Array.isArray(matches)) return unknown("donnees_incompletes");
  const finals = matches.filter((m) => /^final$/i.test(String(m.round_raw || m.phase || "").trim()));
  if (finals.length === 2) return twoLegFinal(finals, unknown);
  if (finals.length !== 1) return unknown("finale_ambigue");
  const m = finals[0];
  if (m.status !== "finished" || !["FT", "AET", "PEN"].includes(m.ext?.status_short)) return unknown("finale_non_confirmee");
  if (!m.home_club_id || !m.away_club_id || m.home_club_id === m.away_club_id) return unknown("equipes_non_identifiees");
  const e = m.ext || {};
  const valid = (v) => Number.isInteger(v) && v >= 0;
  let side = null;
  if (e.status_short === "PEN") {
    if (!valid(e.home_penalties) || !valid(e.away_penalties) || e.home_penalties === e.away_penalties) return unknown("tirs_au_but_absents");
    side = e.home_penalties > e.away_penalties ? "home" : "away";
  } else {
    if (!valid(m.home_score) || !valid(m.away_score) || m.home_score === m.away_score) return unknown("score_ambigu");
    side = m.home_score > m.away_score ? "home" : "away";
  }
  const homeFlag = e.home_winner; const awayFlag = e.away_winner;
  if ((homeFlag != null && homeFlag !== (side === "home")) || (awayFlag != null && awayFlag !== (side === "away"))) return unknown("resultat_contradictoire");
  return { status: "candidate", clubId: side === "home" ? m.home_club_id : m.away_club_id, matchId: m.id, basis: e.status_short === "PEN" ? "penalties" : "score" };
}

// On ne suppose jamais que le premier d'une phase est champion. La proposition
// exige une indication explicite du fournisseur et une saison sans match non terminé.
export function leagueWinnerCandidate({ competitionType, groups, complete = false, totalMatches, finishedMatches } = {}) {
  const unknown = (reason) => ({ status: "needs_review", reason });
  if (competitionType !== "league") return unknown("format_non_pris_en_charge");
  if (!complete || !Array.isArray(groups) || !Number.isInteger(totalMatches) || totalMatches < 1 || finishedMatches !== totalMatches) return unknown("saison_incomplete");
  const rows = groups.flatMap((group) => Array.isArray(group?.rows) ? group.rows : []);
  const marked = rows.filter((row) => /^(champion|champions|winner|winners)$/i.test(String(row?.description || "").trim()));
  if (marked.length !== 1 || marked[0].rank !== 1 || !marked[0].club || !(marked[0].played > 0)) return unknown("champion_non_confirme");
  return { status: "candidate", clubId: marked[0].club, basis: "provider_champion" };
}

function twoLegFinal(finals, unknown) {
  const [first, last] = [...finals].sort((a, b) => String(a.kickoff || "").localeCompare(String(b.kickoff || "")));
  const a = Date.parse(first.kickoff || ""); const b = Date.parse(last.kickoff || "");
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) return unknown("ordre_manches_inconnu");
  if (!first.home_club_id || !first.away_club_id || first.home_club_id === first.away_club_id || first.home_club_id !== last.away_club_id || first.away_club_id !== last.home_club_id) return unknown("equipes_non_identifiees");
  if (first.status !== "finished" || last.status !== "finished" || first.ext?.status_short !== "FT" || !["FT", "AET", "PEN"].includes(last.ext?.status_short)) return unknown("finale_non_confirmee");
  const valid = (v) => Number.isInteger(v) && v >= 0;
  if (![first.home_score, first.away_score, last.home_score, last.away_score].every(valid)) return unknown("score_ambigu");
  const firstTeam = first.home_score + last.away_score;
  const secondTeam = first.away_score + last.home_score;
  let winner;
  if (last.ext?.status_short === "PEN") {
    if (firstTeam !== secondTeam) return unknown("resultat_contradictoire");
    const home = last.ext.home_penalties; const away = last.ext.away_penalties;
    if (!valid(home) || !valid(away) || home === away) return unknown("tirs_au_but_absents");
    winner = home > away ? last.home_club_id : last.away_club_id;
  } else {
    // En cas d'égalité, la règle des buts à l'extérieur dépend de la compétition et de l'époque.
    if (firstTeam === secondTeam) return unknown("regle_departage_inconnue");
    winner = firstTeam > secondTeam ? first.home_club_id : first.away_club_id;
  }
  // En aller-retour, les indicateurs de chaque match peuvent désigner le gagnant
  // de la manche et non celui de la confrontation : ne pas les interpréter.
  return { status: "candidate", clubId: winner, matchId: last.id, matchIds: [first.id, last.id], basis: last.ext?.status_short === "PEN" ? "penalties" : "aggregate" };
}
