import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { SettingsConflictError, sameSetting, updateSiteSettings } from "@/lib/siteSettings";

const seed = (data = { labels: { a: 1 } }) => createFakeSupabase({ site_settings: [{ id: 1, data }] });
const stored = (db) => db.rows("site_settings")[0].data;
// Simule un écrivain concurrent qui passe entre la lecture et l'écriture `times` fois.
function withRacer(db, times, racerPatch) {
  let left = times;
  return {
    from(name) {
      const query = db.from(name);
      const update = query.update.bind(query);
      query.update = (payload) => {
        if (name === "site_settings" && left > 0) {
          left--;
          const row = db.rows("site_settings")[0];
          row.data = { ...row.data, ...racerPatch(row.data), _rev: (Number(row.data._rev) || 0) + 1 };
        }
        return update(payload);
      };
      return query;
    },
  };
}

describe("updateSiteSettings — révision et réapplication", () => {
  it("premier enregistrement (sans _rev) : clé écrite, autres clés conservées, _rev = 1", async () => {
    const db = seed({ labels: { a: 1 }, football_import_plan: { version: 4 } });
    await updateSiteSettings(db, { labels: { a: 2 } });
    expect(stored(db)).toEqual({ labels: { a: 2 }, football_import_plan: { version: 4 }, _rev: 1 });
    await updateSiteSettings(db, { home: { hero: "x" } });
    expect(stored(db)).toMatchObject({ labels: { a: 2 }, home: { hero: "x" }, _rev: 2 });
  });

  it("écriture concurrente entre lecture et écriture : relue, les DEUX clés sont conservées", async () => {
    const db = seed({ labels: { a: 1 }, _rev: 5 });
    const raced = withRacer(db, 2, () => ({ football_competition_refresh_state: { "c-1": "2026-10-25T20:00:00Z" } }));
    await updateSiteSettings(raced, { labels: { a: 2 } });
    expect(stored(db)).toEqual({ labels: { a: 2 }, football_competition_refresh_state: { "c-1": "2026-10-25T20:00:00Z" }, _rev: 8 });
  });

  it("fonction de mise à jour rappelée sur les données RELUES à chaque tentative", async () => {
    const db = seed({ competition_stats: { "c-1": { title: "A" } }, _rev: 1 });
    const raced = withRacer(db, 1, (data) => ({ competition_stats: { ...data.competition_stats, "c-2": { title: "B" } } }));
    const seen = [];
    await updateSiteSettings(raced, (current) => { seen.push(Object.keys(current.competition_stats)); return { competition_stats: { ...current.competition_stats, "c-3": { title: "C" } } }; });
    expect(seen).toEqual([["c-1"], ["c-1", "c-2"]]);
    expect(Object.keys(stored(db).competition_stats).sort()).toEqual(["c-1", "c-2", "c-3"]);
  });

  it("fonction qui renonce (null) : rien n'est écrit, _rev inchangée", async () => {
    const db = seed({ labels: { a: 1 }, _rev: 3 });
    expect(await updateSiteSettings(db, () => null)).toBeNull();
    expect(stored(db)).toEqual({ labels: { a: 1 }, _rev: 3 });
  });

  it("course permanente : abandon explicite après 8 tentatives, rien d'écrasé", async () => {
    const db = seed({ labels: { a: 1 }, _rev: 1 });
    const raced = withRacer(db, 100, () => ({ cron: true }));
    await expect(updateSiteSettings(raced, { labels: { a: "perdu ?" } })).rejects.toThrow(/modifié en continu/);
    expect(stored(db).labels).toEqual({ a: 1 });
    expect(stored(db)._rev).toBe(9); // 8 passages du concurrent, aucune écriture de notre part
  });

  it("formulaire : clé modifiée depuis l'ouverture → SettingsConflictError, rien écrit", async () => {
    const db = seed({ football_import_plan: { version: 4, seasons: ["2027-2028"] }, _rev: 4 });
    const error = await updateSiteSettings(db, { football_import_plan: { version: 4 } }, { expected: { football_import_plan: { version: 4 } } }).catch((caught) => caught);
    expect(error).toBeInstanceOf(SettingsConflictError);
    expect(error.keys).toEqual(["football_import_plan"]);
    expect(error.message).toMatch(/recharge la page/);
    expect(stored(db)).toEqual({ football_import_plan: { version: 4, seasons: ["2027-2028"] }, _rev: 4 });
  });

  it("formulaire : clé inchangée (ordre des clés jsonb indifférent), autre clé changée par le cron → enregistré", async () => {
    const db = seed({ football_import_plan: { seasons: [1], version: 4 }, _rev: 1 });
    const raced = withRacer(db, 1, () => ({ football_competition_refresh_state: { x: 1 } }));
    await updateSiteSettings(raced, { football_import_plan: { version: 4, seasons: [1, 2] } }, { expected: { football_import_plan: { version: 4, seasons: [1] } } });
    expect(stored(db)).toMatchObject({ football_import_plan: { version: 4, seasons: [1, 2] }, football_competition_refresh_state: { x: 1 } });
  });

  it("formulaire ouvert alors que la clé n'existait pas : null attendu, création acceptée", async () => {
    const db = seed({});
    await updateSiteSettings(db, { football_live_strategy: { live_seconds: 30 } }, { expected: { football_live_strategy: null } });
    expect(stored(db)).toEqual({ football_live_strategy: { live_seconds: 30 }, _rev: 1 });
  });

  it("ligne absente ou erreur de lecture : erreur explicite", async () => {
    await expect(updateSiteSettings(createFakeSupabase({ site_settings: [] }), { a: 1 })).rejects.toThrow(/introuvable/);
  });

  it("sameSetting : indépendant de l'ordre des clés, sensible aux valeurs et aux tableaux", () => {
    expect(sameSetting({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(sameSetting({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameSetting(undefined, null)).toBe(true);
    expect(sameSetting({ a: 1 }, { a: "1" })).toBe(false);
  });
});

describe("plus aucun écrivain direct de site_settings", () => {
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith(".js") ? [path.join(dir, entry.name)] : []);
  it("hors lib/siteSettings.js, site_settings n'est que LU", () => {
    const writers = [];
    for (const file of ["app", "components", "lib", "modules"].flatMap(files)) {
      if (file.replace(/\\/g, "/") === "lib/siteSettings.js") continue;
      const code = fs.readFileSync(file, "utf8");
      for (const match of code.matchAll(/from\("site_settings"\)\s*\.\s*(update|upsert|insert|delete)\(/g)) writers.push(`${file}: ${match[1]}`);
    }
    expect(writers).toEqual([]);
  });
  it("formulaires sensibles : valeur lue à l'ouverture transmise comme attendue", () => {
    expect(fs.readFileSync("components/admin/ImportPlanPanel.js", "utf8")).toContain("await updateSiteSettings(supabase, { football_import_plan: storedPlan }, { expected: { football_import_plan: loadedPlan.current } });");
    expect(fs.readFileSync("components/admin/LiveStrategyPanel.js", "utf8")).toContain("await updateSiteSettings(supabase, { football_live_strategy: strategy }, { expected: { football_live_strategy: loadedStrategy.current } });");
  });
});
