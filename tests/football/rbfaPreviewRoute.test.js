import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
const { GET } = await import("@/app/api/admin/rbfa-selection-preview/route");
const request = (suffix = "?category=senior", authorized = true) => new Request(`http://localhost/api/admin/rbfa-selection-preview${suffix}`, { headers: authorized ? { authorization: "Bearer test" } : {} });
const entry = (id, name, date) => `<CENTER><A HREF=/project/publiek/jrinterfr/speler_PH_${id}.htm><IMG SRC=x></CENTER><BR><CENTER>${name}<BR>${date}<BR>Club<BR></A>`;

afterEach(() => vi.unstubAllGlobals());

describe("comparaison RBFA en lecture seule", () => {
  it("refuse les utilisateurs sans jeton avant tout accès", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await GET(request("?category=senior", false))).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("refuse un compte non administrateur sans appeler la fédération", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    state.db = createFakeSupabase({ profiles: [{ id: "user", role: "member" }] });
    state.db.auth = { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) };
    expect((await GET(request())).status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("réserve aussi le statut automatique aux administrateurs", async () => {
    state.db = createFakeSupabase({ profiles: [{ id: "user", role: "member" }], site_settings: [{ id: 1, data: { football_rbfa_monitor: { senior: { error: "test" } } } }] });
    state.db.auth = { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) };
    expect((await GET(request("?status=1"))).status).toBe(403);
    state.db.rows("profiles")[0].role = "admin";
    const response = await GET(request("?status=1"));
    expect(await response.json()).toMatchObject({ monitor: { senior: { error: "test" } } });
  });
  it("refuse une page source vide sans modifier les données", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("page indisponible")));
    state.db = createFakeSupabase({ profiles: [{ id: "admin", role: "admin" }], national_team_callups: [{ id: "c1", active: true }] });
    state.db.auth = { getUser: async () => ({ data: { user: { id: "admin" } }, error: null }) };
    expect((await GET(request())).status).toBe(502);
    expect(state.db.rows("national_team_callups")).toEqual([{ id: "c1", active: true }]);
  });
  it("compare une liste officielle valide sans aucune écriture", async () => {
    const html = Array.from({ length: 11 }, (_, i) => entry(String(i + 1), `Alain Joueur${i}`, `${String(i + 1).padStart(2, "0")}-02-2000`)).join("");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { headers: { "content-type": "text/html" } })));
    state.db = createFakeSupabase({
      profiles: [{ id: "admin", role: "admin" }],
      clubs: [{ id: "team", source: "apifootball", external_id: "1", name: "Belgique", team_type: "national" }],
      players: [{ id: "p0", name: "A. Joueur0", birth_date: "2000-02-01" }],
      national_team_callups: [{ id: "c1", player_id: "old", national_team_id: "team", active: true }],
    });
    state.db.auth = { getUser: async () => ({ data: { user: { id: "admin" } }, error: null }) };
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ officialCount: 11, complete: false, removals: null });
    expect(body.additions).toEqual([expect.objectContaining({ playerId: "p0" })]);
    expect(body.unresolved).toHaveLength(10);
    expect(state.db.rows("national_team_callups")).toEqual([{ id: "c1", player_id: "old", national_team_id: "team", active: true }]);
  });
  it("signale un verrou incompatible même si toute la liste est identifiée", async () => {
    const html = Array.from({ length: 11 }, (_, i) => entry(String(i + 1), `Alain Joueur${i}`, `${String(i + 1).padStart(2, "0")}-02-2000`)).join("");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html)));
    const players = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, name: `Alain Joueur${i}`, birth_date: `2000-02-${String(i + 1).padStart(2, "0")}` }));
    state.db = createFakeSupabase({ profiles: [{ id: "admin", role: "admin" }], clubs: [{ id: "team", source: "apifootball", external_id: "1", name: "Belgique", team_type: "national" }], players, national_team_callups: [{ id: "locked", player_id: "old", national_team_id: "team", season: "2026-2027", active: true, locked: true, source: "manual" }] });
    state.db.auth = { getUser: async () => ({ data: { user: { id: "admin" } }, error: null }) };
    const response = await GET(request());
    const body = await response.json();
    expect(body.complete).toBe(true);
    expect(body.plan).toMatchObject({ ready: false, protectedConflicts: ["locked"] });
    expect(state.db.rows("national_team_callups")[0].active).toBe(true);
  });
});
