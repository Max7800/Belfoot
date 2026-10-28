import { beforeEach, describe, expect, it } from "vitest";
import { dueLeague, followBelgiansAbroad, followTargets, scanIntervalDays, scanStep } from "@/modules/football/belgiansAbroadFollow";
import { registerProvider } from "@/modules/football/providers";
import { preflightJobs, requiredMigrationsForJob } from "@/lib/jobPreflight";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const NOW = new Date("2026-10-28T12:00:00Z");
const H = 3600000;
const stats = (extra = {}) => ({ season: "2026-2027", league: "Eredivisie", league_id: "88", league_logo: "ere.png", country: "Netherlands", appearances: 9, goals: 2, ...extra });

describe("suivi des Belges à l'étranger : cadence", () => {
  it("balayage : chaque semaine pendant le mercato (juillet, août, janvier), sinon toutes les deux semaines", () => {
    expect(["2026-07-10", "2026-08-31", "2027-01-15", "2026-10-28", "2026-12-01", "2026-06-30"].map((date) => scanIntervalDays(new Date(`${date}T12:00:00Z`)))).toEqual([7, 7, 7, 14, 14, 14]);
  });
  it("cycles de balayage : premier passage sans relancer, cycle en cours poursuivi, nouveau cycle à l'échéance", () => {
    expect(scanStep(null, NOW)).toEqual({ run: false, next: { leagueIndex: 0, page: 1, cycleStartedAt: NOW.toISOString(), cycleCompletedAt: NOW.toISOString() } });
    const running = { leagueIndex: 3, page: 2, cycleStartedAt: "2026-10-27T00:00:00Z", cycleCompletedAt: null };
    expect(scanStep(running, NOW)).toEqual({ run: true, next: running });
    const done = { leagueIndex: 0, page: 1, cycleStartedAt: "2026-10-20T00:00:00Z", cycleCompletedAt: "2026-10-25T00:00:00Z" };
    expect(scanStep(done, NOW).run).toBe(false); // 8 jours < 14
    expect(scanStep({ ...done, cycleStartedAt: "2026-10-14T00:00:00Z" }, NOW)).toEqual({ run: true, next: { leagueIndex: 0, page: 1, cycleStartedAt: NOW.toISOString(), cycleCompletedAt: null } });
  });
  it("championnats suivis d'après les Belges du balayage ; programme relu une fois par jour, le plus ancien d'abord", () => {
    const targets = followTargets([
      { id: "p1", club_id: "k-ajax", ext: { league_stats: stats() } },
      { id: "p2", club_id: "k-az", ext: { league_stats: stats() } },
      { id: "p3", club_id: "k-mls", ext: { league_stats: stats({ league: "MLS", league_id: "253", country: "USA" }) } },
      { id: "p4", club_id: null, ext: { league_stats: stats() } },
      { id: "p5", club_id: "k-ajax", ext: {} },
    ], { "k-ajax": { external_id: "194" }, "k-az": { external_id: "201" }, "k-mls": { external_id: "1600" } });
    expect(targets.map((target) => [target.id, [...target.clubs], target.calendar])).toEqual([["88", ["194", "201"], false], ["253", ["1600"], true]]);
    expect(dueLeague(targets, {}, NOW.getTime()).id).toBe("88");
    expect(dueLeague(targets, { 88: { fixturesAt: new Date(NOW - 2 * H).toISOString() } }, NOW.getTime()).id).toBe("253");
    expect(dueLeague(targets, { 88: { fixturesAt: new Date(NOW - 25 * H).toISOString() }, 253: { fixturesAt: new Date(NOW - 30 * H).toISOString() } }, NOW.getTime()).id).toBe("253"); // deux dus : le plus ancien
    expect(dueLeague(targets, { 88: { fixturesAt: new Date(NOW - 2 * H).toISOString() }, 253: { fixturesAt: new Date(NOW - 19 * H).toISOString() } }, NOW.getTime())).toBeNull();
  });
});

describe("suivi des Belges à l'étranger : un passage", () => {
  let calls;
  const fixture = (id, home, away, status, kickoff, extra = {}) => ({ external_id: id, home_ext: home, away_ext: away, home_name: `Club ${home}`, away_name: `Club ${away}`, home_logo: null, away_logo: null, home_score: status === "finished" ? 2 : null, away_score: status === "finished" ? 1 : null, status, minute: null, kickoff, round: "Regular Season - 10", ...extra });
  const register = (overrides = {}) => registerProvider({
    key: "apifootball",
    async fetchMatchesWindow(competition, ctx) { calls.push(`window:${competition.external_id}:${ctx.season}:${ctx.from}:${ctx.to}`); return [fixture("5001", "194", "197", "finished", "2026-10-27T18:00:00Z"), fixture("5002", "197", "201", "finished", "2026-10-27T16:00:00Z"), fixture("5003", "205", "194", "scheduled", "2026-11-01T14:30:00Z")]; },
    async fetchMatchLineups(match) { calls.push(`lineups:${match.external_id}`); return []; },
    async fetchMatchPlayerStats(match) { calls.push(`players:${match.external_id}`); return [{ team_ext: "194", player_ext: "1", player_name: "Belge", minutes: 90, rating: 7.6, goals: 1, starter: true, substitute: false }]; },
    async fetchMatchTeamStats(match) { calls.push(`team:${match.external_id}`); return []; },
    async fetchEvents(match) { calls.push(`events:${match.external_id}`); return []; },
    async fetchLeaguePlayersPage() { calls.push("scan"); return { players: [], pages: 1 }; },
    ...overrides,
  });
  const seed = () => createFakeSupabase({
    clubs: [{ id: "k-ajax", source: "apifootball", external_id: "194", name: "Ajax", team_type: "first_team", locked: false, ext: {} }],
    players: [{ id: "p-1", source: "apifootball", external_id: "1", name: "Belge", nationality: "Belgium", club_id: "k-ajax", tracked: true, active: true, locked: false, ext: { league_stats: stats() } }],
    site_settings: [{ id: 1, data: {} }],
  });
  beforeEach(() => { calls = []; register(); });

  it("programme du championnat, matchs des clubs de Belges seulement, compétition masquée, feuille du match terminé", async () => {
    const db = seed();
    const result = await followBelgiansAbroad(db, { now: NOW });
    expect(calls).toEqual(["window:88:2026:2026-10-26:2026-11-04", "lineups:5001", "players:5001", "team:5001", "events:5001"]);
    const competition = db.rows("competitions")[0];
    expect(competition).toMatchObject({ external_id: "88", name: "Eredivisie", public_visible: false, competition_scope: "etranger", ext: { country: "Netherlands", imported_for: "belgians-abroad" } });
    expect(db.rows("matches").map((match) => match.external_id).sort()).toEqual(["5001", "5003"]); // pas PSV – AZ
    expect(db.rows("matches").find((match) => match.external_id === "5001")).toMatchObject({ competition_id: competition.id, status: "finished", home_club_id: "k-ajax" });
    expect(db.rows("match_player_stats")).toEqual([expect.objectContaining({ player_id: "p-1", minutes: 90, rating: 7.6, goals: 1 })]);
    const state = db.rows("site_settings")[0].data.football_abroad_follow_state;
    expect(state.leagues["88"]).toMatchObject({ fixturesAt: NOW.toISOString(), matches: 2, competitionId: competition.id });
    expect(state.scan).toMatchObject({ cycleCompletedAt: NOW.toISOString() }); // le pipeline manuel vient de tourner
    expect(result.detail).toMatch(/Eredivisie : 2 match\(s\) de Belges · 1 feuille\(s\) de match/);
  });
  it("passage suivant (1 h plus tard) : rien à refaire, aucun appel", async () => {
    const db = seed();
    await followBelgiansAbroad(db, { now: NOW });
    calls = [];
    const result = await followBelgiansAbroad(db, { now: new Date(NOW.getTime() + H) });
    expect(calls).toEqual([]);
    expect(result.detail).toMatch(/1 championnat\(s\) suivi\(s\), rien à faire/);
  });
  it("feuille en échec deux fois : écartée ensuite (plus d'appels sur ce match)", async () => {
    register({ async fetchMatchPlayerStats(match) { calls.push(`players:${match.external_id}`); throw new Error("API indisponible"); } });
    const db = seed();
    for (let run = 0; run < 3; run++) await followBelgiansAbroad(db, { now: new Date(NOW.getTime() + run * H) });
    expect(calls.filter((call) => call === "players:5001")).toHaveLength(2);
    expect(db.rows("site_settings")[0].data.football_abroad_follow_state.failures).toEqual({ [db.rows("matches").find((match) => match.external_id === "5001").id]: 2 });
  });
  it("échéance dépassée : aucun appel lancé", async () => {
    const db = seed();
    await followBelgiansAbroad(db, { now: NOW, deadline: Date.now() - 1 });
    expect(calls).toEqual([]);
  });
});

describe("tâche planifiée : budget du suivi accepté par le vrai préflight", () => {
  it("12 appels en périmètre global", async () => {
    const db = createFakeSupabase({ schema_migrations: requiredMigrationsForJob("football.abroad-follow", "2026-2027") });
    const result = await preflightJobs(db, { key: "football.abroad-follow", globalScope: true, requestLimit: 12 }, { globalScope: true });
    expect(result.blockers).toEqual([]);
    expect(result.total.max).toBe(12);
  });
});

describe("suivi des Belges : programme refusé par l'API", () => {
  it("noté avec la requête, reporté, et le reste du passage continue", async () => {
    const calls = [];
    registerProvider({
      key: "apifootball",
      async fetchMatchesWindow() { calls.push("window"); throw new Error("API-Football: {\"plan\":\"Free plans do not have access to this season, try from 2022 to 2024.\"}"); },
      async fetchLeaguePlayersPage() { calls.push("scan"); return { players: [], pages: 1 }; },
    });
    const db = createFakeSupabase({
      clubs: [{ id: "k-ajax", source: "apifootball", external_id: "194", name: "Ajax", locked: false, ext: {} }],
      players: [{ id: "p-1", source: "apifootball", external_id: "1", name: "Belge", nationality: "Belgium", club_id: "k-ajax", tracked: true, active: true, locked: false, ext: { league_stats: stats() } }],
      site_settings: [{ id: 1, data: { football_abroad_follow_state: { scan: { leagueIndex: 2, page: 1, cycleStartedAt: "2026-10-27T00:00:00Z", cycleCompletedAt: null } } } }],
    });
    const result = await followBelgiansAbroad(db, { now: NOW, leagues: [{ id: "88", name: "Eredivisie", country: "Netherlands" }, { id: "1", name: "A", country: "X" }, { id: "2", name: "B", country: "Y" }] });
    expect(calls).toEqual(["window", "scan"]); // le balayage continue malgré l'échec
    const state = db.rows("site_settings")[0].data.football_abroad_follow_state;
    expect(state.leagues["88"]).toMatchObject({ fixturesAt: NOW.toISOString(), error: expect.stringContaining("Eredivisie (88, saison 2026) : API-Football") });
    expect(result.detail).toContain("programme en échec — Eredivisie (88, saison 2026)");
  });
});
