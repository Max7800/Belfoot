// Réponses /fixtures FICTIVES, construites à la main selon la structure lue
// par mapFixture. Ce ne sont pas des réponses enregistrées de l'API.

export function rawFixture({
  id,
  date,
  leagueId = 5,
  leagueName = "UEFA Nations League",
  season,
  round = "League A - 1",
  home = { id: 1, name: "Belgium" },
  away = { id: 2, name: "France" },
  status = "FT",
  goals = { home: 1, away: 0 },
}) {
  return {
    fixture: {
      id,
      date,
      referee: null,
      venue: { name: "Stade Roi Baudouin", city: "Bruxelles" },
      status: { short: status, long: status === "FT" ? "Match Finished" : "Not Started", elapsed: status === "FT" ? 90 : null, extra: null },
    },
    league: {
      id: leagueId,
      name: leagueName,
      country: "World",
      logo: null,
      flag: null,
      ...(season !== undefined ? { season } : {}),
      round,
    },
    teams: {
      home: { id: home.id, name: home.name, logo: null },
      away: { id: away.id, name: away.name, logo: null },
    },
    goals,
  };
}
