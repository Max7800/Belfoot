import { readAll } from "./readAll";

const seasonYear = (value) => Number((String(value || "").match(/\d{4}/) || [0])[0]);

// Les affectations peuvent inclure d'anciens joueurs qui ont changé de club.
// Ne pas lire d'abord les joueurs courants si les affectations suffisent.
export async function loadClubRosterData(db, clubId) {
  const memberships = await readAll(() => db.from("player_team_seasons").select("*").eq("club_id", clubId).order("season_start_year", { ascending: false, nullsFirst: false }));
  const membershipRows = memberships.error ? [] : (memberships.data || []);
  if (membershipRows.length) {
    const playerIds = [...new Set(membershipRows.map((row) => row.player_id))];
    const related = await readAll(() => db.from("players").select("*").in("id", playerIds).order("name"));
    if (!related.error) return { memberships: membershipRows, players: related.data || [] };
  }
  const current = await readAll(() => db.from("players").select("*").eq("club_id", clubId).order("name"));
  return { memberships: membershipRows, players: current.data || [] };
}

// Les affectations inactives restent pertinentes dans une archive, pas dans
// l'effectif courant. Une saison demandée ne doit jamais changer par repli.
export function selectClubRoster({ memberships = [], players = [], requestedYear = 0, contextYear = 0, currentYear }) {
  const years = memberships.map((row) => row.season_start_year || seasonYear(row.season)).filter(Boolean);
  const rosterYear = requestedYear || contextYear || Math.max(0, ...years);
  const rosterMemberships = memberships.filter((row) => {
    const year = row.season_start_year || seasonYear(row.season);
    return (!rosterYear || year === rosterYear) && (rosterYear !== currentYear || row.active !== false);
  });
  const membershipByPlayer = new Map(rosterMemberships.map((row) => [row.player_id, row]));
  const squad = memberships.length
    ? players.filter((player) => membershipByPlayer.has(player.id))
    : (!rosterYear || rosterYear === currentYear ? players : []);
  return { rosterYear, membershipByPlayer, squad };
}
