import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const state = vi.hoisted(() => ({ current: {} }));
vi.mock("@/lib/siteSettings", () => ({ updateSiteSettings: async (_db, patch) => {
  const changes = patch(state.current);
  if (!changes) return null;
  state.current = { ...state.current, ...changes };
  return state.current;
} }));
const { nextRbfaCategory, observedRbfaState, monitorRbfaSelection, monitorRbfaSelections, RBFA_MONITOR_KEY } = await import("@/modules/football/rbfaMonitor");
const person = (sourceId) => ({ sourceId, name: `Joueur ${sourceId}`, club: "Club" });
const entry = (id) => `<CENTER><A HREF=/project/publiek/jrinterfr/speler_PH_${id}.htm><IMG SRC=x></CENTER><BR><CENTER>Joueur ${id}<BR>01-02-2000<BR>Club<BR></A>`;

describe("surveillance RBFA", () => {
  it("alterne les catégories et respecte une heure entre les vérifications", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    expect(nextRbfaCategory({}, now)).toBe("senior");
    expect(nextRbfaCategory({ senior: { attemptedAt: "2026-11-18T11:30:00Z" } }, now)).toBe("u21");
    expect(nextRbfaCategory({ senior: { attemptedAt: "2026-11-18T11:30:00Z" }, u21: { attemptedAt: "2026-11-18T11:30:00Z" } }, now)).toBe("u19");
  });
  it("archive seulement un changement de joueurs, pas un simple réordonnancement", () => {
    const initial = observedRbfaState(null, [person("1"), person("2")], "2026-11-18T10:00:00Z");
    const reordered = observedRbfaState(initial, [person("2"), person("1")], "2026-11-18T11:00:00Z");
    expect(reordered.changedAt).toBeNull();
    const changed = observedRbfaState(reordered, [person("2"), person("3")], "2026-11-18T12:00:00Z");
    expect(changed.changedAt).toBe("2026-11-18T12:00:00Z");
    expect(changed.history[0].players).toEqual(reordered.players);
  });
  it("garde la dernière liste valide en cas de page incomplète", async () => {
    state.current = { [RBFA_MONITOR_KEY]: { senior: { players: [person("1")], observedAt: "2026-11-17T09:00:00Z" } }, unrelated: "intact" };
    const result = await monitorRbfaSelection(null, state.current, { now: new Date("2026-11-18T12:00:00Z"), fetcher: async () => new Response("page indisponible") });
    expect(result.ok).toBe(false);
    expect(state.current[RBFA_MONITOR_KEY].senior.players).toEqual([person("1")]);
    expect(state.current.unrelated).toBe("intact");
  });
  it("stocke une liste valide sans toucher aux convocations", async () => {
    state.current = { national_team_callups: "intact" };
    const html = Array.from({ length: 11 }, (_, i) => entry(i + 1)).join("");
    const result = await monitorRbfaSelection(null, state.current, { now: new Date("2026-11-18T12:00:00Z"), fetcher: async () => new Response(html) });
    expect(result.ok).toBe(true);
    expect(state.current[RBFA_MONITOR_KEY].senior.players).toHaveLength(11);
    expect(state.current.national_team_callups).toBe("intact");
  });
  it("enregistre les identités reliées, puis réessaie au passage suivant", async () => {
    state.current = {};
    const html = Array.from({ length: 11 }, (_, i) => entry(i + 1)).join("");
    const resolveLinks = vi.fn(async () => new Map([["1", "player-1"]]));
    const result = await monitorRbfaSelection(null, state.current, { now: new Date("2026-11-18T12:00:00Z"), fetcher: async () => new Response(html), resolveLinks });
    expect(result.ok).toBe(true);
    expect(state.current[RBFA_MONITOR_KEY].senior.players[0].playerId).toBe("player-1");
    expect(state.current[RBFA_MONITOR_KEY].senior.players[1].playerId).toBeUndefined();
    expect(resolveLinks).toHaveBeenCalledOnce();
  });
  it("conserve la liste RBFA si la recherche de fiches échoue", async () => {
    state.current = {};
    const html = Array.from({ length: 11 }, (_, i) => entry(i + 1)).join("");
    const result = await monitorRbfaSelection(null, state.current, { now: new Date("2026-11-18T12:00:00Z"), fetcher: async () => new Response(html), resolveLinks: async () => { throw new Error("base indisponible"); } });
    expect(result).toMatchObject({ ok: true, linkError: "base indisponible" });
    expect(state.current[RBFA_MONITOR_KEY].senior.players).toHaveLength(11);
    expect(state.current[RBFA_MONITOR_KEY].senior.linkError).toBe("base indisponible");
  });
  it("ne remplace pas une observation commencée plus récemment", async () => {
    const newer = { attemptedAt: "2026-11-18T12:01:00.000Z", players: [person("new")] };
    state.current = { [RBFA_MONITOR_KEY]: { senior: newer } };
    const html = Array.from({ length: 11 }, (_, i) => entry(i + 1)).join("");
    const result = await monitorRbfaSelection(null, {}, { now: new Date("2026-11-18T12:00:00Z"), fetcher: async () => new Response(html) });
    expect(result.superseded).toBe(true);
    expect(state.current[RBFA_MONITOR_KEY].senior).toEqual(newer);
  });
  it("applique un effectif complet une seule fois via la transaction quand la migration existe", async () => {
    state.current = {};
    const html = Array.from({ length: 11 }, (_, i) => entry(i + 1)).join("");
    const db = createFakeSupabase({ schema_migrations: [{ module: "football", version: "0043_rbfa_callups_atomic" }], clubs: [{ id: "team", source: "apifootball", external_id: "1", team_type: "national" }] }, { rpc: { apply_rbfa_callups_atomic: async () => ({ data: { players: 11 }, error: null }) } });
    const resolveLinks = async () => new Map(Array.from({ length: 11 }, (_, i) => [String(i + 1), `p${i + 1}`]));
    const result = await monitorRbfaSelection(db, {}, { fetcher: async () => new Response(html), resolveLinks });
    expect(result.application).toMatchObject({ state: "appliquee", players: 11 });
    expect(db.rpcCalls.filter((call) => call.name === "apply_rbfa_callups_atomic")).toHaveLength(1);
  });
  it("signale la migration absente sans modifier les convocations", async () => {
    state.current = {};
    const html = Array.from({ length: 11 }, (_, i) => entry(i + 1)).join("");
    const db = createFakeSupabase();
    const resolveLinks = async () => new Map(Array.from({ length: 11 }, (_, i) => [String(i + 1), `p${i + 1}`]));
    const result = await monitorRbfaSelection(db, {}, { fetcher: async () => new Response(html), resolveLinks });
    expect(result.application.state).toBe("migration_absente");
    expect(db.rpcCalls).toHaveLength(0);
  });
  it("observe une catégorie jeune sans modifier les convocations ni la transaction A/U21", async () => {
    const recent = { attemptedAt: "2026-11-18T11:30:00Z" };
    state.current = { [RBFA_MONITOR_KEY]: { senior: recent, u21: recent } };
    const html = Array.from({ length: 21 }, (_, i) => entry(i + 1)).join("");
    const db = createFakeSupabase();
    const resolveLinks = async () => new Map(Array.from({ length: 21 }, (_, i) => [String(i + 1), `p${i + 1}`]));
    const result = await monitorRbfaSelection(db, state.current, { now: new Date("2026-11-18T12:00:00Z"), fetcher: async () => new Response(html), resolveLinks });
    expect(result).toMatchObject({ category: "u19", ok: true });
    expect(state.current[RBFA_MONITOR_KEY].u19.players).toHaveLength(21);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("parcourt au maximum trois catégories différentes dans un passage", async () => {
    state.current = {};
    const html = Array.from({ length: 21 }, (_, i) => entry(i + 1)).join("");
    const fetcher = vi.fn(async () => new Response(html));
    const result = await monitorRbfaSelections(null, {}, { now: new Date("2026-11-18T12:00:00Z"), fetcher, resolveLinks: async () => new Map() });
    expect(result.results.map((row) => row.category)).toEqual(["senior", "u21", "u19"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

});
