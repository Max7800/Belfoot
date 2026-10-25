import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { adminRequest, confirmationText, JobBlockedError, launchJob, preflightSummary } from "@/lib/adminJobs";

const PREFLIGHT_OK = { ok: true, target: "Pro League", season: "2026-2027", steps: [{ label: "Sync", min: 1, max: 4, basis: "matchs" }], total: { min: 1, max: 4 }, budget: 30, quotaRemaining: 7300, warnings: [], blockers: [] };
// Faux réseau : enregistre les appels et répond selon la route.
function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (path, init) => {
    calls.push({ path, init, body: JSON.parse(init.body) });
    const [status, body] = routes[path] || [404, "Not found"];
    return { ok: status < 400, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
  };
  return { calls, request: { fetchImpl, getToken: async () => "jeton-test" } };
}

describe("adminRequest", () => {
  it("POST JSON avec le jeton de session ; réponse JSON", async () => {
    const { calls, request } = fakeFetch({ "/api/admin/run-job": [200, { detail: "ok · 3/30 appels" }] });
    expect(await adminRequest("/api/admin/run-job", { key: "football.sync" }, request)).toEqual({ detail: "ok · 3/30 appels" });
    expect(calls[0].init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer jeton-test" } });
    expect(calls[0].body).toEqual({ key: "football.sync" });
  });
  it("erreur en texte brut (format des routes admin) : message exact conservé", async () => {
    const { request } = fakeFetch({ "/api/admin/job-preflight": [400, "Saison inconnue pour cette compétition."] });
    await expect(adminRequest("/api/admin/job-preflight", {}, request)).rejects.toThrow("Saison inconnue pour cette compétition.");
  });
  it("erreur JSON : detail, puis error ; corps vide : code HTTP", async () => {
    const detail = fakeFetch({ "/x": [500, { detail: "D", error: "E" }] });
    await expect(adminRequest("/x", {}, detail.request)).rejects.toThrow(/^D$/);
    const error = fakeFetch({ "/x": [500, { error: "E" }] });
    await expect(adminRequest("/x", {}, error.request)).rejects.toThrow(/^E$/);
    const empty = fakeFetch({ "/x": [403, ""] });
    await expect(adminRequest("/x", {}, empty.request)).rejects.toThrow("HTTP 403");
  });
  it("succès en texte brut : renvoyé comme detail", async () => {
    const { request } = fakeFetch({ "/x": [200, "terminé"] });
    expect(await adminRequest("/x", {}, request)).toEqual({ detail: "terminé" });
  });
});

describe("launchJob — préflight, blocages, confirmation, lancement", () => {
  const payload = { key: "football.sync", competitionId: "c-144", season: "2026-2027", requestLimit: 30 };
  it("préflight validé et confirmé : lance le MÊME payload", async () => {
    const { calls, request } = fakeFetch({ "/api/admin/job-preflight": [200, PREFLIGHT_OK], "/api/admin/run-job": [200, { detail: "fait" }] });
    const seen = [];
    const outcome = await launchJob(payload, { ...request, confirm: (preflight) => { seen.push(preflight.total.max); return true; } });
    expect(calls.map((call) => call.path)).toEqual(["/api/admin/job-preflight", "/api/admin/run-job"]);
    expect(calls[0].body).toEqual(payload);
    expect(calls[1].body).toEqual(payload);
    expect(seen).toEqual([4]);
    expect(outcome).toMatchObject({ cancelled: false, result: { detail: "fait" } });
  });
  it("blocage : aucune confirmation, aucun lancement, blocages dans l'erreur", async () => {
    const { calls, request } = fakeFetch({ "/api/admin/job-preflight": [200, { ...PREFLIGHT_OK, ok: false, blockers: ["Budget insuffisant.", "Saison non autorisée."] }] });
    let asked = false;
    const error = await launchJob(payload, { ...request, confirm: () => { asked = true; return true; } }).catch((caught) => caught);
    expect(error).toBeInstanceOf(JobBlockedError);
    expect(error.message).toBe("Budget insuffisant. · Saison non autorisée.");
    expect(asked).toBe(false);
    expect(calls.map((call) => call.path)).toEqual(["/api/admin/job-preflight"]);
  });
  it("confirmation refusée : rien n'est lancé, statut effacé", async () => {
    const { calls, request } = fakeFetch({ "/api/admin/job-preflight": [200, PREFLIGHT_OK] });
    const statuses = [];
    const outcome = await launchJob(payload, { ...request, confirm: () => false, onStatus: (text) => statuses.push(text) });
    expect(outcome.cancelled).toBe(true);
    expect(calls.map((call) => call.path)).toEqual(["/api/admin/job-preflight"]);
    expect(statuses.at(-1)).toBe("");
  });
  it("lot déjà confirmé (confirm: null) : préflight puis lancement sans question", async () => {
    const { calls, request } = fakeFetch({ "/api/admin/job-preflight": [200, PREFLIGHT_OK], "/api/admin/run-job": [200, { detail: "ok" }] });
    expect((await launchJob(payload, { ...request, confirm: null })).cancelled).toBe(false);
    expect(calls.map((call) => call.path)).toEqual(["/api/admin/job-preflight", "/api/admin/run-job"]);
  });
  it("confirmation oubliée : refus avant tout appel", async () => {
    const { calls, request } = fakeFetch({});
    await expect(launchJob(payload, request)).rejects.toThrow(/confirmation obligatoire/);
    expect(calls).toEqual([]);
  });
  it("échec du lancement : erreur serveur exacte", async () => {
    const { request } = fakeFetch({ "/api/admin/job-preflight": [200, PREFLIGHT_OK], "/api/admin/run-job": [500, "Ce job est déjà en cours pour cette sélection."] });
    await expect(launchJob(payload, { ...request, confirm: () => true })).rejects.toThrow("Ce job est déjà en cours pour cette sélection.");
  });
});

describe("textes", () => {
  it("préflight détaillé (panneau Jobs) : étapes, total, budget, quota, blocages", () => {
    expect(preflightSummary(PREFLIGHT_OK)).toBe("Cible : Pro League · saison 2026-2027\n1. Sync : 1–4 appel(s) — matchs\nTOTAL : 1–4 appel(s) · budget 30 · dernier quota connu 7300\n✓ Préflight validé.");
    expect(preflightSummary({ ...PREFLIGHT_OK, quotaRemaining: null, warnings: ["W"], blockers: ["B"] })).toMatch(/quota inconnu\nAVERTISSEMENTS :\n- W\nBLOCAGES :\n- B$/);
  });
  it("confirmation des fiches : question, précision, coût maximal, avertissements", () => {
    expect(confirmationText("Synchroniser Anderlecht ?", PREFLIGHT_OK, "Effectif.")).toBe("Synchroniser Anderlecht ?\n\nEffectif.\n\nCoût maximal estimé : 4 appel(s) API (budget 30).");
    expect(confirmationText("Q ?", { ...PREFLIGHT_OK, warnings: ["Liste de clubs incomplète."] })).toBe("Q ?\n\nCoût maximal estimé : 4 appel(s) API (budget 30).\n\nAvertissements :\n- Liste de clubs incomplète.");
  });
});

describe("branchement : chaque bouton passe par la façade", () => {
  const read = (file) => fs.readFileSync(file, "utf8");
  const LAUNCHERS = ["app/clubs/[id]/page.js", "app/players/[id]/page.js", "components/football/CompetitionSyncButton.js", "components/admin/panels.js"];
  it("plus aucun appel direct aux routes de lancement hors lib/adminJobs.js", () => {
    for (const file of LAUNCHERS) expect(read(file)).not.toMatch(/fetch\("\/api\/admin\/(run-job|job-preflight|run-pipeline)"/);
  });
  it("fiches club, joueur et compétition : launchJob avec confirmation", () => {
    const club = read("app/clubs/[id]/page.js");
    expect(club).toContain("const payload = { key: \"football.club-sync\", competitionId: competition.id, clubId: club.id, season, requestLimit: 10 };");
    expect(club).toMatch(/launchJob\(payload, \{\s*onStatus: setCareerStatus,\s*confirm: \(preflight\) => window\.confirm\(confirmationText\(`Synchroniser \$\{club\.name\}/);
    expect(club).toContain("await launchJob(payload, { confirm: null });"); // carrières : lot confirmé une fois
    expect(read("app/players/[id]/page.js")).toMatch(/launchJob\(payload, \{\s*onStatus: setAdminStatus,\s*confirm: \(preflight\) => window\.confirm\(confirmationText\(/);
    const button = read("components/football/CompetitionSyncButton.js");
    expect(button).toMatch(/launchJob\(\{ key: "football\.sync", competitionId: competition\.id, season: target, requestLimit: 30 \}, \{\s*confirm: \(preflight\) => window\.confirm\(/);
    expect(button).toContain("const target = season || competition.ext?.season || null;");
    expect(read("app/competitions/[slug]/page.js")).toContain("<CompetitionSyncButton competition={comp} season={seasonLabel || null} />");
  });
  it("panneau Jobs : même texte de préflight et mêmes requêtes", () => {
    const panel = read("components/admin/panels.js");
    expect(panel).toContain('import { adminRequest, preflightSummary } from "@/lib/adminJobs";');
    expect(panel).toContain("const preflightText = preflightSummary;");
    expect(panel).toContain('const callJob = (key, budget) => adminRequest("/api/admin/run-job", { key, ...jobParams(), requestLimit: budget ?? requestLimit });');
  });
});
