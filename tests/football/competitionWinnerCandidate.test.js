import { describe, expect, it } from "vitest";
import { cupWinnerCandidate } from "@/lib/competitionWinnerCandidate";
import { mapFixture } from "@/modules/football/apifootball";
import { rawFixture } from "../helpers/apiFootballFixtures";

const final = (patch = {}) => ({ id: "match", round_raw: "Final", status: "finished", home_club_id: "home", away_club_id: "away", home_score: 2, away_score: 1, ext: { status_short: "FT" }, ...patch });
const candidate = (matches, extra = {}) => cupWinnerCandidate({ competitionType: "cup", complete: true, matches, ...extra });
describe("proposition prudente pour une coupe", () => {
  it("identifie une finale unique finie et ne traite pas les demi-finales", () => {
    expect(candidate([final(), final({ id: "semi", round_raw: "Semi-finals" })])).toMatchObject({ status: "candidate", clubId: "home", basis: "score" });
    expect(candidate([final({ round_raw: "Semi-finals" })]).reason).toBe("finale_ambigue");
  });
  it("prend les tirs au but, jamais le score nul, pour une séance de penalties", () => {
    const m = final({ home_score: 1, away_score: 1, ext: { status_short: "PEN", home_penalties: 3, away_penalties: 4, home_winner: false, away_winner: true } });
    expect(candidate([m])).toMatchObject({ status: "candidate", clubId: "away", basis: "penalties" });
    expect(candidate([{ ...m, ext: { status_short: "PEN" } }]).reason).toBe("tirs_au_but_absents");
  });
  it("refuse une finale ambiguë, un forfait, des données partielles et des résultats contradictoires", () => {
    expect(candidate([final(), final({ id: "second" })]).reason).toBe("finale_ambigue");
    expect(candidate([final({ ext: { status_short: "WO" } })]).reason).toBe("finale_non_confirmee");
    expect(candidate([final()], { complete: false }).reason).toBe("donnees_incompletes");
    expect(candidate([final()], { competitionType: "league" }).reason).toBe("format_non_pris_en_charge");
    expect(candidate([final({ ext: { status_short: "FT", home_winner: false, away_winner: true } })]).reason).toBe("resultat_contradictoire");
  });
  it("conserve les données de penalties et indicateurs fournisseur sans inventer de valeurs", () => {
    const input = rawFixture({ id: 5, date: "2026-10-01T20:00:00Z" });
    input.teams.home.winner = false; input.teams.away.winner = true;
    input.score = { penalty: { home: 4, away: 5 } };
    expect(mapFixture(input)).toMatchObject({ home_winner: false, away_winner: true, home_penalties: 4, away_penalties: 5 });
    delete input.score; delete input.teams.home.winner;
    expect(mapFixture(input)).toMatchObject({ home_winner: null, home_penalties: null });
  });
});
