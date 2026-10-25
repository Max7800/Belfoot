import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Scénario réel : l'administrateur enregistre le plan d'import PENDANT un
// passage du cron competition-refresh. Avant, l'état du cron était écrit avec
// le JSON relu juste avant… mais toute écriture intercalée entre cette lecture
// et l'UPDATE était perdue ; ici l'écriture de l'admin a lieu entre les deux.
const state = vi.hoisted(() => ({ db: null, adminWrites: 0 }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
vi.mock("@/lib/jobs", () => ({ runJob: async (key) => (key === "football.squads" ? { complete: true } : "ok") }));
const { GET } = await import("@/app/api/cron/competition-refresh/route");

const SECRET = "secret-de-test";
const NOW = new Date("2026-10-25T12:00:00Z").getTime();
const PLAN = { version: 4, seasons: [{ label: "2026-2027", enabled: true }], competitions: { "c-144": { enabled: true, seasons: { "2026-2027": { enabled: true, scope: "base" } } } } };

// Faux client : la PREMIÈRE écriture du cron est précédée d'un enregistrement
// administrateur (plan modifié + révision incrémentée), comme une course réelle.
function racingDb(db) {
  return {
    ...db,
    from(name) {
      const query = db.from(name);
      const update = query.update.bind(query);
      query.update = (payload) => {
        if (name === "site_settings" && state.adminWrites === 0) {
          state.adminWrites++;
          const row = db.rows("site_settings")[0];
          row.data = { ...row.data, football_import_plan: { ...PLAN, edited_by_admin: true }, _rev: (Number(row.data._rev) || 0) + 1 };
        }
        return update(payload);
      };
      return query;
    },
  };
}

beforeAll(() => { process.env.CRON_SECRET = SECRET; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
afterAll(() => { delete process.env.CRON_SECRET; vi.useRealTimers(); });

describe("cron competition-refresh et enregistrement administrateur simultané", () => {
  it("l'état du cron est enregistré ET le plan modifié par l'admin est conservé", async () => {
    const db = createFakeSupabase({
      competitions: [{ id: "c-144", name: "Pro League", provider: "apifootball", external_id: "144", public_visible: true, competition_scope: "belgique" }],
      seasons: [{ id: "s-26", competition_id: "c-144", label: "2026-2027", import_status: "active", public_active: true }],
      site_settings: [{ id: 1, data: { football_import_plan: PLAN, labels: { garde: "oui" } } }],
    });
    state.db = racingDb(db);
    const response = await (await GET(new Request("http://localhost/api/cron/competition-refresh", { headers: { authorization: `Bearer ${SECRET}` } }))).json();
    expect(response.ok).toBe(true);
    const data = db.rows("site_settings")[0].data;
    expect(state.adminWrites).toBe(1);
    expect(data.football_import_plan.edited_by_admin).toBe(true); // écriture admin conservée
    expect(data.football_competition_refresh_state["c-144"]).toBe(new Date(NOW).toISOString()); // état du cron enregistré
    expect(data.labels).toEqual({ garde: "oui" });
  });
});
