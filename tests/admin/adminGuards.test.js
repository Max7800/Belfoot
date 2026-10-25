import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { FOOTBALL_ENTITIES } from "@/config/football-admin";
import {
  DELETE_IMPACT, auditAdminAction, blockedDeleteText, deleteConfirmationText, deleteImpact,
  identityChanges, identityConfirmationText, isGuardedDelete, typedConfirmationMatches,
} from "@/lib/adminGuards";

describe("DELETE_IMPACT reflète TOUTES les clés étrangères des migrations", () => {
  // Relevé direct des migrations : une nouvelle clé étrangère vers ces tables
  // sans mise à jour de DELETE_IMPACT fait échouer ce test.
  const migrationFiles = () => [
    ...fs.readdirSync("modules").flatMap((module) => { const dir = path.join("modules", module, "migrations"); return fs.existsSync(dir) ? fs.readdirSync(dir).map((file) => path.join(dir, file)) : []; }),
    ...fs.readdirSync("supabase/migrations").map((file) => path.join("supabase/migrations", file)),
  ].filter((file) => file.endsWith(".sql")).sort();
  const foreignKeys = () => {
    const found = [];
    for (const file of migrationFiles()) {
      let current = null;
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const table = line.match(/(?:create table if not exists|create table|alter table(?: if exists)?(?: only)?)\s+(?:public\.)?([a-z_]+)/i);
        if (table) current = table[1];
        const reference = line.match(/([a-z_]+)\s+uuid\s+(?:not null\s+)?references\s+(?:public\.)?(competitions|seasons|clubs)\s*\(id\)(?:\s+on delete\s+(cascade|set null|restrict|no action))?/i);
        if (reference) found.push({ target: reference[2], table: current, column: reference[1], rule: (reference[3] || "no action").toLowerCase() });
      }
    }
    return found;
  };
  it("chaque clé est listée, et seules les clés sans ON DELETE bloquent", () => {
    const keys = foreignKeys();
    expect(keys.length).toBeGreaterThan(25);
    for (const key of keys) {
      const rule = (DELETE_IMPACT[key.target] || []).find((item) => item.table === key.table && item.column === key.column);
      expect(rule, `${key.table}.${key.column} → ${key.target}`).toBeTruthy();
      expect(Boolean(rule.blocks), `${key.table}.${key.column} (${key.rule})`).toBe(["no action", "restrict"].includes(key.rule));
    }
    const declared = Object.entries(DELETE_IMPACT).flatMap(([target, rules]) => rules.map((rule) => `${target}:${rule.table}.${rule.column}`));
    expect(declared.sort()).toEqual(keys.map((key) => `${key.target}:${key.table}.${key.column}`).sort()); // rien d'inventé
  });
});

describe("deleteImpact", () => {
  const db = () => createFakeSupabase({
    seasons: [{ id: "s1", competition_id: "c1" }, { id: "s2", competition_id: "c1" }, { id: "s3", competition_id: "c2" }],
    matches: [{ id: "m1", competition_id: "c1", home_club_id: "k1", away_club_id: "k2" }, { id: "m2", competition_id: "c1", home_club_id: "k2", away_club_id: "k1" }, { id: "m3", competition_id: "c1", home_club_id: "k1", away_club_id: "k3" }],
    player_season_stats: [{ id: "p1", competition_id: "c1", club_id: "k9" }],
    players: [{ id: "j1", club_id: "k4" }],
  });
  it("compétition : compte exact par table liée, seules les tables non vides, non bloquée", async () => {
    const impact = await deleteImpact(db(), "competitions", "c1");
    expect(impact.blocked).toBe(false);
    expect(impact.items.map((item) => [item.table, item.count])).toEqual([["seasons", 2], ["matches", 3], ["player_season_stats", 1]]);
  });
  it("club joué en match : suppression bloquée (NO ACTION en base)", async () => {
    const impact = await deleteImpact(db(), "clubs", "k1");
    expect(impact.blocked).toBe(true);
    expect(impact.items.filter((item) => item.blocks).map((item) => [item.column, item.count])).toEqual([["home_club_id", 2], ["away_club_id", 1]]);
  });
  it("club sans match : non bloqué, effets listés", async () => {
    const impact = await deleteImpact(db(), "clubs", "k4");
    expect(impact).toMatchObject({ blocked: false, items: [{ table: "players", column: "club_id", count: 1 }] });
  });
  it("comptage impossible : erreur explicite (la suppression n'est pas tentée)", async () => {
    const failing = { from: () => ({ select: () => ({ eq: async () => ({ count: null, error: { message: "permission denied" } }) }) }) };
    await expect(deleteImpact(failing, "seasons", "s1")).rejects.toThrow(/Impact de la suppression impossible à mesurer \(club_season_coverage\) : permission denied/);
  });
  it("tables protégées : compétitions, saisons, clubs seulement", () => {
    expect(["competitions", "seasons", "clubs"].every(isGuardedDelete)).toBe(true);
    expect(isGuardedDelete("matches")).toBe(false);
  });
});

describe("textes et confirmation tapée", () => {
  const impact = { blocked: false, items: [{ count: 2, label: "saison(s)", effect: "supprimée(s) avec leurs données de couverture" }, { count: 3, label: "match(s)", effect: "conservé(s) mais détaché(s) de toute compétition et saison" }] };
  it("suppression : conséquences chiffrées, irréversible, copie dans le journal", () => {
    expect(deleteConfirmationText("Compétition", "Pro League", impact)).toBe("Supprimer compétition « Pro League » ? Action IRRÉVERSIBLE.\n\nConséquences :\n- 2 saison(s) : supprimée(s) avec leurs données de couverture\n- 3 match(s) : conservé(s) mais détaché(s) de toute compétition et saison\n\nUne copie de la ligne est conservée dans le journal d'audit.\nTape le nom exact pour confirmer :");
    expect(deleteConfirmationText("Saison", "2024-2025", { items: [] })).toMatch(/Aucune donnée liée\./);
  });
  it("suppression bloquée : seulement les références bloquantes, rien supprimé", () => {
    const text = blockedDeleteText("Club", "Anderlecht", { items: [{ count: 2, label: "match(s) à domicile", blocks: true }, { count: 5, label: "joueur(s)" }] });
    expect(text).toBe("Suppression impossible : club « Anderlecht » est encore référencé(e) par :\n- 2 match(s) à domicile\n\nRéaffecte ou fusionne d'abord ces données. Rien n'a été supprimé.");
  });
  it("nom tapé : exact (espaces autour tolérés), vide ou annulé refusé", () => {
    expect(typedConfirmationMatches(" Pro League ", "Pro League")).toBe(true);
    expect(typedConfirmationMatches("pro league", "Pro League")).toBe(false);
    expect(typedConfirmationMatches(null, "Pro League")).toBe(false); // Annuler
    expect(typedConfirmationMatches("", "")).toBe(false);
  });
});

describe("identité fournisseur", () => {
  it("changements détectés sur une ligne existante uniquement, valeurs comparées en texte", () => {
    expect(identityChanges({ id: "c1", provider: "apifootball", external_id: 850 }, { id: "c1", provider: "apifootball", external_id: "666" }, ["provider", "external_id"])).toEqual([{ field: "external_id", before: 850, after: "666" }]);
    expect(identityChanges({ id: "c1", external_id: 850 }, { id: "c1", external_id: "850" }, ["external_id"])).toEqual([]);
    expect(identityChanges({}, { name: "Nouvelle", external_id: "1" }, ["external_id"])).toEqual([]); // création
    expect(identityChanges({ id: "c1", external_id: null }, { id: "c1", external_id: "" }, ["external_id"])).toEqual([]);
  });
  it("texte : avant → après et risque de mélange", () => {
    expect(identityConfirmationText("Compétition", "U21", [{ field: "external_id", before: "850", after: "666" }])).toMatch(/^Changer l'identité fournisseur de compétition « U21 » \?\n\n- external_id : 850 → 666\n\n.*mélange deux compétitions\.\n\nTape le nom exact pour confirmer :$/s);
  });
  it("compétitions : provider et external_id protégés", () => {
    expect(FOOTBALL_ENTITIES.competitions.identityFields).toEqual(["provider", "external_id"]);
  });
});

describe("journal d'audit", () => {
  it("auteur = utilisateur connecté ; action, table, cible et méta enregistrées", async () => {
    const db = createFakeSupabase({ audit_log: [] });
    db.auth = { getUser: async () => ({ data: { user: { id: "u-admin" } } }) };
    const { error } = await auditAdminAction(db, { action: "competitions.delete", table: "competitions", id: "c1", meta: { row: { id: "c1", name: "X" } } });
    expect(error).toBeNull();
    expect(db.rows("audit_log")).toMatchObject([{ actor: "u-admin", action: "competitions.delete", target_table: "competitions", target_id: "c1", meta: { row: { id: "c1", name: "X" } } }]);
  });
});

describe("EntityManager : branchement des garde-fous", () => {
  const code = fs.readFileSync("components/admin/EntityManager.js", "utf8");
  it("suppression : impact mesuré, blocage, nom tapé, résultat vérifié, copie journalisée", () => {
    expect(code).toContain("try { impact = await deleteImpact(supabase, table, r.id); } catch (error) { alert(error.message); return; }");
    expect(code).toContain("if (impact.blocked) { alert(blockedDeleteText(singular, name, impact)); return; }");
    expect(code).toContain("if (!typedConfirmationMatches(window.prompt(deleteConfirmationText(singular, name, impact)), name)) { alert(\"Nom non confirmé : rien n'a été supprimé.\"); return; }");
    expect(code).toContain("const { data: deleted, error } = await supabase.from(table).delete().eq(\"id\", r.id).select(\"*\");");
    expect(code).toContain("if (!deleted?.length) { alert(\"Aucune ligne supprimée (droits insuffisants ou déjà supprimée).\"); load(); return; }");
    expect(code).toContain("await auditAdminAction(supabase, { action: `${table}.delete`, table, id: r.id, meta: { row: deleted[0], impact: impactSummary } });");
    expect(code).not.toContain("if (!confirm(\"Supprimer ?\")) return; await supabase.from(table).delete()");
  });
  it("identité : relue en base, nom tapé avant l'enregistrement, changement journalisé", () => {
    expect(code).toContain("await supabase.from(table).select([\"id\", ...spec.identityFields].join(\",\")).eq(\"id\", row.id).maybeSingle();");
    expect(code).toMatch(/if \(changes\.length && !typedConfirmationMatches\(window\.prompt\(identityConfirmationText\(singular, name, changes\)\), name\)\) \{[^}]*return; \}\s*\}\s*const \{ error \} = await supabase\.from\(table\)\.upsert\(row\);/);
    expect(code).toContain("await auditAdminAction(supabase, { action: `${table}.identity.update`, table, id: row.id, meta: { changes } });");
  });
});
