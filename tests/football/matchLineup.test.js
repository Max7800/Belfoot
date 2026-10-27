import { beforeEach, describe, expect, it } from "vitest";
import { eventDetailLabel, findMatchPlayer, positionLetter, ratingBadge, teamLineup } from "@/lib/matchLineup";
import { registerProvider } from "@/modules/football/providers";
import { syncLineups } from "@/modules/football/syncLineups";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Cas réel du 27/10/2026 : 23 joueurs marqués titulaires par les statistiques,
// seuls 11 placés sur le terrain par la composition officielle.
const row = (id, grid, extra = {}) => ({ id, player_name: `Joueur ${id}`, number: Number(id.slice(1)), position: "M", grid, starter: true, rating: 6.5, ...extra });

describe("composition d'une équipe", () => {
  const rows = [row("p1", "1:1", { position: "G" }), row("p2", "2:4"), row("p3", "2:1"), row("p4", "2:2"), row("p5", "2:3"), row("p6", "3:2"), row("p7", "3:1"), row("p8", "4:1"), row("p9", "4:2"), row("p10", "4:3"), row("p11", "5:1", { position: "F" }), row("p12", null, { rating: 0 }), row("p13", null)];
  const lineup = { formation: "4-2-3-1", ext: { coach: { name: "V. GoncharenkÃ¶" }, team: { colors: { player: { primary: "810000", number: "ffffff", border: "810000" }, goalkeeper: { primary: "fbff0a" } } } } };
  it("titulaires = joueurs placés par la grille ; le reste sur le banc", () => {
    const team = teamLineup({ rows, lineup });
    expect(team.starters.map((item) => item.id)).toEqual(["p1", "p3", "p4", "p5", "p2", "p7", "p6", "p8", "p9", "p10", "p11"]);
    expect(team.bench.map((item) => item.id)).toEqual(["p12", "p13"]);
  });
  it("lignes du terrain du but vers l'avant, colonnes dans l'ordre", () => {
    expect(teamLineup({ rows: [...rows].reverse(), lineup }).lines.map((line) => line.map((item) => item.id))).toEqual([["p1"], ["p3", "p4", "p5", "p2"], ["p7", "p6"], ["p8", "p9", "p10"], ["p11"]]);
  });
  it("formation, entraîneur (nom réparé), couleurs des maillots ; note 0 = pas de note", () => {
    const team = teamLineup({ rows, lineup });
    expect(team).toMatchObject({ formation: "4-2-3-1", coach: { name: "V. Goncharenkö" } });
    expect(team.colors.player).toEqual({ shirt: "#810000", number: "#ffffff", border: "#810000" });
    expect(team.colors.goalkeeper.shirt).toBe("#fbff0a");
    expect(team.colors.goalkeeper.number).toBeNull();
    expect(teamLineup({ rows, lineup: { ext: { team: { colors: { player: { primary: "red", number: "#fff" } } } } } }).colors.player).toEqual({ shirt: null, number: null, border: null });
    expect(team.bench.find((item) => item.id === "p12").rating).toBeNull();
  });
  it("sans grille (ancien import) : drapeau titulaire ; sans composition : rien d'inventé", () => {
    const noGrid = teamLineup({ rows: [row("p1", null), row("p2", null, { starter: false })] });
    expect(noGrid.starters.map((item) => item.id)).toEqual(["p1"]);
    expect(noGrid.lines).toEqual([]);
    expect(teamLineup({ rows: [], lineup: null })).toMatchObject({ formation: null, coach: null, starters: [], bench: [] });
    expect(teamLineup({ rows: [row("p1", "x:y")] }).lines).toEqual([]);
  });
  it("libellés : poste, note, précision d'un fait de match", () => {
    expect(["G", "D", "M", "F", "f", null].map(positionLetter)).toEqual(["G", "D", "M", "A", "A", ""]);
    expect([8.1, 7.2, 6.4, 5.9, null].map(ratingBadge)).toEqual(["bg-emerald-400 text-slate-950", "bg-lime-400 text-slate-950", "bg-amber-300 text-slate-950", "bg-red-400 text-white", "bg-white/[0.08] text-muted"]);
    expect(["Normal Goal", "Yellow Card", "Substitution 2", "Own Goal", "Penalty", "Missed Penalty", "Second Yellow card", "Goal cancelled", "", "Foul"].map(eventDetailLabel))
      .toEqual([null, null, null, "contre son camp", "penalty", "penalty manqué", "deuxième jaune", "but annulé", null, "Foul"]);
  });
});

describe("synchro : la composition officielle fait foi pour les titulaires", () => {
  beforeEach(() => registerProvider({ key: "testprov" }));
  it("un remplaçant marqué « non remplaçant » par les statistiques reste remplaçant", async () => {
    registerProvider({
      key: "testprov",
      async fetchMatchLineups() {
        return [{ team_ext: "10", formation: "4-4-2", ext: {}, players: [
          { team_ext: "10", player_ext: "1", player_name: "Titulaire", number: 9, position: "F", grid: "5:1", starter: true, substitute: false },
          { team_ext: "10", player_ext: "2", player_name: "Remplaçant", number: 14, position: "M", grid: null, starter: false, substitute: true },
        ] }];
      },
      async fetchMatchPlayerStats() {
        return [
          { team_ext: "10", player_ext: "1", player_name: "Titulaire", minutes: 90, rating: 7.1, starter: true, substitute: false },
          { team_ext: "10", player_ext: "2", player_name: "Remplaçant", minutes: 12, rating: 6.4, starter: true, substitute: false },
          { team_ext: "10", player_ext: "3", player_name: "Hors compo", minutes: 0, starter: false, substitute: true },
        ];
      },
    });
    const db = createFakeSupabase({
      clubs: [{ id: "club-10", source: "testprov", external_id: "10", name: "Club 10" }],
      seasons: [{ id: "s-1", competition_id: "comp-1", label: "2026-2027" }],
      matches: [{ id: "m-1", source: "testprov", external_id: "500", competition_id: "comp-1", season_id: "s-1", status: "finished", kickoff: "2026-10-20T18:00:00+00:00" }],
    });
    await syncLineups(db, { id: "comp-1", name: "Test", provider: "testprov", external_id: "1", ext: {} }, { season: "2026-2027" });
    const byExternal = Object.fromEntries(db.rows("match_player_stats").map((item) => [item.player_external_id, item]));
    expect(byExternal["1"]).toMatchObject({ starter: true, substitute: false, grid: "5:1", minutes: 90, rating: 7.1 });
    expect(byExternal["2"]).toMatchObject({ starter: false, substitute: true, minutes: 12, rating: 6.4 });
    expect(byExternal["3"]).toMatchObject({ starter: false, substitute: true });
  });
});

describe("joueur d'un fait de match retrouvé par son nom", () => {
  const rows = [
    { player_id: "boteli", player_name: "Winsley Boteli Mokango" },
    { player_id: "chouaref", player_name: "Ylyas Chouaref" },
    { player_id: "djordjevic", player_name: "Luka Đorđević" },
    { player_id: "sakuta", player_name: "Maksim Sakuta" },
    { player_id: "sakuta2", player_name: "Igor Sakuta" },
    { player_id: null, player_name: "Sans Fiche" },
    { player_id: "lah", player_name: "J. LÃ¤hteenmÃ¤ki" },
  ];
  it("nom abrégé de l'API : initiale + nom de famille", () => {
    expect(findMatchPlayer("W. Boteli", rows)).toBe("boteli");
    expect(findMatchPlayer("I. Chouaref", rows)).toBeNull(); // initiale différente : pas de lien au hasard
    expect(findMatchPlayer("Y. Chouaref", rows)).toBe("chouaref");
  });
  it("nom complet, accents et casse ignorés, nom abîmé réparé", () => {
    expect(findMatchPlayer("ylyas chouaref", rows)).toBe("chouaref");
    expect(findMatchPlayer("L. Đorđević", rows)).toBe("djordjevic");
    expect(findMatchPlayer("J. Lähteenmäki", rows)).toBe("lah");
  });
  it("ambigu, sans fiche ou inconnu : pas de lien", () => {
    expect(findMatchPlayer("Sakuta", rows)).toBeNull();
    expect(findMatchPlayer("M. Sakuta", rows)).toBe("sakuta");
    expect(findMatchPlayer("Sans Fiche", rows)).toBeNull();
    expect(findMatchPlayer("A. Inconnu", rows)).toBeNull();
    expect(findMatchPlayer("", rows)).toBeNull();
    expect(findMatchPlayer("M.", rows)).toBeNull();
  });
  it("homonyme sans fiche ignoré ; nom exact préféré à un nom plus long", () => {
    expect(findMatchPlayer("Igor Sakuta", [{ player_id: null, player_name: "Igor Sakuta" }, { player_id: "igor", player_name: "Igor Sakuta" }])).toBe("igor");
    expect(findMatchPlayer("Igor Sakuta", [{ player_id: "junior", player_name: "Igor Sakuta Junior" }, { player_id: "igor", player_name: "Igor Sakuta" }])).toBe("igor");
  });
});
