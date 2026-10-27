import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const read = (file) => fs.readFileSync(file, "utf8");
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith(".js") ? [path.join(dir, entry.name)] : []);
// Pages et composants vus par les visiteurs (administration et API exclues).
const PUBLIC_FILES = [...files("app"), ...files("components/football")].map((file) => file.replace(/\\/g, "/")).filter((file) => !file.startsWith("app/admin/") && !file.startsWith("app/api/"));
// Le texte réservé à l'administrateur (<AdminHint>) n'est pas vu par les visiteurs.
// Les commentaires de code (lignes « // ») ne sont pas affichés non plus.
const visitorText = (source) => source.replace(/<AdminHint>[\s\S]*?<\/AdminHint>/g, "").replace(/^\s*\/\/.*$/gm, "");

describe("textes publics sans jargon d'administration", () => {
  const FORBIDDEN = ["migration SQL", "job plafonné", "Aucun titulaire importé", "Aucune performance importée", "Aucun résultat importé", "apparaîtront après la synchronisation", "apparaîtra après sa synchronisation", "à compléter dans l'administration", "Crée-la dans l’administration", "Import en préparation", "pendant l’import partiel", "compétition étrangère synchronisée", "imports de carrière ou manuellement", "après une synchronisation ciblée", "Une nouvelle synchronisation de base enregistrera", "Lance la synchronisation complète", "à renseigner", "À renseigner", "Le suivi international est prêt"];
  it("aucune formule technique visible par un visiteur", () => {
    const found = [];
    for (const file of PUBLIC_FILES) {
      const text = visitorText(read(file));
      for (const phrase of FORBIDDEN) if (text.includes(phrase)) found.push(`${file} : ${phrase}`);
    }
    expect(found).toEqual([]);
  });
  it("les indications techniques restent disponibles pour l'administrateur", () => {
    expect(read("app/diables-rouges/page.js")).toContain("<AdminHint>appliquer la migration SQL 0027, puis lancer « Synchroniser une sélection » dans l’administration.</AdminHint>");
    expect(read("app/clubs/[id]/page.js")).toContain("Palmarès pas encore renseigné.<AdminHint>à compléter dans l’administration (fiche club).</AdminHint>");
    expect(read("components/football/NationsLeagueStandings.js")).toContain("Groupe calculé à partir des matchs joués.<AdminHint>");
  });
  it("AdminHint : rien pour un visiteur, indication pour un administrateur", () => {
    const hint = read("components/AdminHint.js");
    expect(hint).toContain("const { isAdmin } = useAuth();");
    expect(hint).toContain("if (!isAdmin) return null;");
  });
  it("chaque fichier qui utilise AdminHint l'importe", () => {
    for (const file of PUBLIC_FILES) {
      const source = read(file);
      if (source.includes("<AdminHint>")) expect(source, file).toContain('import AdminHint from "@/components/AdminHint";');
    }
  });
});

describe("Belges à l'étranger et en-têtes", () => {
  it("libellés « inconnu » partagés : la carte ignore exactement le pays inconnu affiché", () => {
    expect(read("lib/belgiansAbroad.js")).toContain('export const UNKNOWN_COUNTRY = "Pays non précisé";');
    expect(read("components/football/BelgiansWorldMap.js")).toContain("if (!raw || raw === UNKNOWN_COUNTRY) continue;");
    const page = read("app/belges-a-l-etranger/page.js");
    expect(page).toContain("|| UNKNOWN_COUNTRY;");
    expect(page).toContain("league.name || UNKNOWN_COMPETITION;");
  });
  it("carte du monde : styles au format react-simple-maps 5 (avant : pays tous noirs)", () => {
    const map = read("components/football/BelgiansWorldMap.js");
    expect(map).not.toMatch(/style=\{\{\s*default:/); // ancienne API (v3), ignorée par la v5
    expect(map).toContain("fill={fillFor(n)}");
    expect(map).toContain('className={n ? "bf-geo bf-geo-active" : "bf-geo"}');
    expect(map).toContain(".bf-geo-active:hover,.bf-geo-active:active{fill:#e30613;}");
    expect(read("package.json")).toMatch(/"react-simple-maps": "\^5\./);
  });
  it("en-tête de compétition : pays en français (« Belgium » → « Belgique »)", () => {
    expect(read("components/football/CompetitionHeader.js")).toContain('european ? "Europe" : frenchNationName(comp.ext?.country), seasonLabel]');
  });
});

describe("page de match", () => {
  const page = read("app/matchs/[id]/page.js");
  it("textes vides selon l'état du match", () => {
    expect(page).toContain('const emptyEvents = status.key === "scheduled" ? "Les faits du match apparaîtront pendant la rencontre."');
    expect(page).toContain('status.live ? "Aucun fait de match pour l’instant."');
    expect(page).toContain("<MatchTeamStats homeClub={home} awayClub={away} rows={teamStats} compact empty={emptyTeamStats} />");
    expect(read("components/football/MatchTeamStats.js")).toContain('text-sm text-muted">{empty}</div>;');
  });
  it("match à venir : la date n'est plus affichée deux fois", () => {
    // Date et heure une seule fois, au-dessus du score ; la pastille de statut dit « À venir ».
    expect(page).toContain('{status.key === "scheduled" ? "À venir" : status.label}');
    expect(page.split('toLocaleString("fr-BE"')).toHaveLength(2);
  });
});

describe("mise en page et technique", () => {
  it("Diables Rouges : plus de débordement horizontal sur mobile (mesuré : 405 px → 390 px)", () => {
    const page = read("app/diables-rouges/page.js");
    expect(page).toContain('<div className="order-1 min-w-0 space-y-4 lg:col-span-8">');
    expect(page).toContain('<aside className="order-5 min-w-0 space-y-4 lg:order-2 lg:col-span-4">');
    expect(page).toContain('statTiles.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"');
  });
  it("CSP Report-Only sans directive ignorée (erreur console sur chaque page)", async () => {
    const { default: config } = await import("../../next.config.js");
    const headers = (await config.headers())[0].headers;
    const policy = headers.find((header) => header.key === "Content-Security-Policy-Report-Only").value;
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(policy).toContain("default-src 'self'");
    expect(headers.find((header) => header.key === "Strict-Transport-Security").value).toContain("max-age=31536000"); // HTTPS toujours imposé
  });
  it("icône d'onglet (app/icon.svg) : plus de /favicon.ico en 404", () => {
    const icon = read("app/icon.svg");
    expect(icon.startsWith("<svg")).toBe(true);
    expect(icon).toContain('viewBox="0 0 64 64"');
  });
  it("fichiers modifiés : JSX valide", () => {
    const espree = createRequire(import.meta.url)("espree");
    for (const file of ["app/matchs/[id]/page.js", "app/diables-rouges/page.js", "app/clubs/[id]/page.js", "app/players/[id]/page.js", "app/page.js", "app/competitions/page.js", "app/competitions/[slug]/page.js", "app/belges-a-l-etranger/page.js", "components/AdminHint.js", "components/football/MatchTeamStats.js", "components/football/MatchLineups.js", "components/football/MatchPlayerRatings.js", "components/football/NationsLeagueStandings.js", "components/football/DiableRatings.js", "components/football/NationalTeamDirectory.js"]) {
      expect(() => espree.parse(read(file), { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } }), file).not.toThrow();
    }
  });
});
