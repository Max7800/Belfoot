// A connector represents a confirmed route, not merely two adjacent fixtures.
export function confirmedBracketPairs(previous = [], next = []) {
  return next.map((match, index) => {
    if (previous.length !== next.length * 2) return false;
    const pair = previous.slice(index * 2, index * 2 + 2);
    const teams = [match.home_club_id, match.away_club_id];
    if (pair.length !== 2 || teams.some((id) => !id) || teams[0] === teams[1]) return false;
    const from = teams.map((id) => pair.findIndex((fixture) => fixture.home_club_id === id || fixture.away_club_id === id));
    return from.includes(0) && from.includes(1);
  });
}
