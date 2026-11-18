import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ current: {} }));
vi.mock("@/lib/siteSettings", () => ({ updateSiteSettings: async (_db, patch) => {
  const changes = patch(state.current);
  if (!changes) return null;
  state.current = { ...state.current, ...changes };
  return state.current;
} }));
const { nextRbfaCategory, observedRbfaState, monitorRbfaSelection, RBFA_MONITOR_KEY } = await import("@/modules/football/rbfaMonitor");
const person = (sourceId) => ({ sourceId, name: `Joueur ${sourceId}`, club: "Club" });
const entry = (id) => `<CENTER><A HREF=/project/publiek/jrinterfr/speler_PH_${id}.htm><IMG SRC=x></CENTER><BR><CENTER>Joueur ${id}<BR>01-02-2000<BR>Club<BR></A>`;

describe("surveillance RBFA", () => {
  it("alterne les catégories et respecte une heure entre les vérifications", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    expect(nextRbfaCategory({}, now)).toBe("senior");
    expect(nextRbfaCategory({ senior: { attemptedAt: "2026-11-18T11:30:00Z" } }, now)).toBe("u21");
    expect(nextRbfaCategory({ senior: { attemptedAt: "2026-11-18T11:30:00Z" }, u21: { attemptedAt: "2026-11-18T11:30:00Z" } }, now)).toBeNull();
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
  it("ne remplace pas une observation commencée plus récemment", async () => {
    const newer = { attemptedAt: "2026-11-18T12:01:00.000Z", players: [person("new")] };
    state.current = { [RBFA_MONITOR_KEY]: { senior: newer } };
    const html = Array.from({ length: 11 }, (_, i) => entry(i + 1)).join("");
    const result = await monitorRbfaSelection(null, {}, { now: new Date("2026-11-18T12:00:00Z"), fetcher: async () => new Response(html) });
    expect(result.superseded).toBe(true);
    expect(state.current[RBFA_MONITOR_KEY].senior).toEqual(newer);
  });
});
