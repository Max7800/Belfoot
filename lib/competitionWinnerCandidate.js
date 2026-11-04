// Proposition à contrôler : ne modifie ni le palmarès ni les données en base.
// Seule une finale unique explicitement identifiée est interprétée ici.
export function cupWinnerCandidate({ competitionType, matches, complete = false } = {}) {
  const unknown = (reason) => ({ status: "needs_review", reason });
  if (competitionType !== "cup") return unknown("format_non_pris_en_charge");
  if (!complete || !Array.isArray(matches)) return unknown("donnees_incompletes");
  const finals = matches.filter((m) => /^final$/i.test(String(m.round_raw || m.phase || "").trim()));
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
