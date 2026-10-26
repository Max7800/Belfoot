import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import siteConfig from "@/config/site";
import { absoluteUrl, siteOrigin } from "@/lib/siteUrl";
import { clubMetadata, competitionMetadata, matchMetadata, playerMetadata } from "@/lib/pageMetadata";
import { loadClubMetadata, loadCompetitionMetadata, loadMatchMetadata, loadPlayerMetadata } from "@/lib/pageMetadataLoaders";
import { sectionMetadata } from "@/lib/seo";
import robots from "@/app/robots";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const read = (file) => fs.readFileSync(file, "utf8");
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith(".js") ? [path.join(dir, entry.name)] : []);

describe("adresse du site : une seule source, aucun domaine en dur", () => {
  it("ordre : SITE_URL → production Vercel → déploiement → local ; https ajouté, barre finale retirée", () => {
    expect(siteOrigin({ SITE_URL: "https://belfoot.be/", VERCEL_PROJECT_PRODUCTION_URL: "belfoot.vercel.app" })).toBe("https://belfoot.be");
    expect(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "belfoot.vercel.app", VERCEL_URL: "belfoot-abc.vercel.app" })).toBe("https://belfoot.vercel.app");
    expect(siteOrigin({ VERCEL_URL: "belfoot-abc.vercel.app" })).toBe("https://belfoot-abc.vercel.app");
    expect(siteOrigin({})).toBe("http://localhost:3000");
    expect(absoluteUrl("/players/1", { VERCEL_PROJECT_PRODUCTION_URL: "belfoot.vercel.app" })).toBe("https://belfoot.vercel.app/players/1");
  });
  it("plus de domaine factice ni d'adresse écrite en dur dans le code", () => {
    const offenders = [...files("app"), ...files("lib"), ...files("components"), "config/site.js"].filter((file) => /a-definir\.be|belfoot\.vercel\.app|siteConfig\.domain/.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

describe("indexation fermée tant que le site n'a pas son domaine", () => {
  it("réglage par défaut : fermé", () => {
    expect(siteConfig.seo.indexable).toBe(false);
  });
  it("robots.txt : exploration permise (pour lire « noindex »), aucun sitemap annoncé ; ouvert : sitemap et hôte", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/compte", "/reset", "/login", "/auth"] } });
    siteConfig.seo.indexable = true;
    try {
      const open = robots();
      expect(open.sitemap).toMatch(/\/sitemap\.xml$/);
      expect(open.host).toMatch(/^https?:\/\//);
    } finally { siteConfig.seo.indexable = false; }
  });
  it("layout racine : noindex selon le réglage, adresse de base depuis lib/siteUrl.js", () => {
    const layout = read("app/layout.js");
    expect(layout).toContain("metadataBase: new URL(siteOrigin()),");
    expect(layout).toContain("...(siteConfig.seo?.indexable ? {} : { robots: { index: false, follow: false } }),");
  });
});

describe("métadonnées des pages", () => {
  it("joueur : titre, nationalités traduites une à une, photo, adresse canonique", () => {
    const meta = playerMetadata({ id: "p1", name: "J. Mokio", position: "Midfielder", nationality: "RD Congo, Belgium", photo_url: "https://img/p.png" }, { name: "Ajax" });
    expect(meta.title).toBe("J. Mokio — Ajax");
    expect(meta.description).toBe("J. Mokio : Milieu · Ajax · RD Congo, Belgique. Statistiques, matchs et parcours.");
    expect(meta.openGraph.images).toEqual([{ url: "https://img/p.png" }]);
    expect(meta.alternates.canonical).toMatch(/\/players\/p1$/);
    expect(playerMetadata(null).title).toBe("Joueur introuvable");
  });
  it("club : pays en français ; compétition masquée : jamais indexée", () => {
    expect(clubMetadata({ id: "k1", name: "Gent", country: "Belgium", logo_url: "https://img/l.png" }).description).toBe("Gent (Belgique) : effectif, matchs, résultats et statistiques.");
    const pro = competitionMetadata({ id: "c1", name: "Pro League", slug: "jupiler-pro-league", competition_scope: "belgique", public_visible: true }, "2026-2027");
    expect(pro).toMatchObject({ title: "Pro League 2026-2027", description: "Pro League (Belgique) : classement, calendrier, résultats et statistiques de la saison 2026-2027." });
    expect(pro.alternates.canonical).toMatch(/\/competitions\/jupiler-pro-league$/);
    expect(pro.robots).toBeUndefined();
    expect(competitionMetadata({ id: "c2", name: "Friendlies Women", public_visible: false }).robots).toEqual({ index: false, follow: false });
  });
  it("match : score dans le titre une fois terminé, sinon « A – B »", () => {
    const home = { name: "Gent" }; const away = { name: "Club Brugge" };
    expect(matchMetadata({ id: "m1", status: "finished", home_score: 2, away_score: 1, kickoff: "2026-10-25T18:00:00Z" }, home, away, { name: "Pro League" })).toMatchObject({ title: "Gent 2-1 Club Brugge", description: "Pro League · 25 octobre 2026 · Score final 2-1" });
    expect(matchMetadata({ id: "m2", status: "scheduled", home_score: null, away_score: null, kickoff: "2026-10-30T19:00:00Z" }, home, away, null)).toMatchObject({ title: "Gent – Club Brugge", description: "30 octobre 2026" });
  });
  it("section (layout couvrant des sous-pages) : modèle de titre transmis, pas d'adresse canonique", () => {
    const meta = sectionMetadata({ title: "Diables Rouges", description: "x" });
    expect(meta.title).toEqual({ default: "Diables Rouges", template: "%s · Belfoot" });
    expect(meta.alternates).toBeUndefined();
  });
});

describe("lecture des métadonnées (tolérante)", () => {
  const db = () => createFakeSupabase({
    players: [{ id: "p1", name: "J. Mokio", position: "Midfielder", nationality: "Belgium", photo_url: null, club_id: "k1" }],
    clubs: [{ id: "k1", name: "Ajax", logo_url: null, ext: { country: "Netherlands" } }, { id: "k2", name: "PSV", logo_url: null, ext: {} }],
    competitions: [{ id: "c1", name: "Pro League", slug: "jupiler-pro-league", public_visible: true, competition_scope: "belgique" }, { id: "c2", name: "Eredivisie", slug: null, public_visible: false }],
    seasons: [{ id: "s1", competition_id: "c1", label: "2026-2027", public_active: true }, { id: "s0", competition_id: "c1", label: "2025-2026", public_active: false }],
    matches: [{ id: "m1", status: "finished", home_score: 3, away_score: 0, kickoff: "2026-10-25T18:00:00Z", home_club_id: "k1", away_club_id: "k2", competition_id: "c2" }],
  });
  it("joueur, club, compétition (route + saison par défaut), match", async () => {
    expect((await loadPlayerMetadata(db(), "p1")).title).toBe("J. Mokio — Ajax");
    expect((await loadClubMetadata(db(), "k1")).description).toBe("Ajax (Pays-Bas) : effectif, matchs, résultats et statistiques.");
    expect((await loadCompetitionMetadata(db(), "jupiler-pro-league")).title).toBe("Pro League 2026-2027");
    expect((await loadMatchMetadata(db(), "m1")).title).toBe("Ajax 3-0 PSV");
  });
  it("absent, sans configuration ou en erreur : métadonnées génériques, jamais d'exception", async () => {
    expect((await loadPlayerMetadata(db(), "inconnu")).title).toBe("Joueur introuvable");
    expect((await loadCompetitionMetadata(db(), "nulle-part")).title).toBe("Compétition introuvable");
    expect((await loadClubMetadata(null, "k1")).title).toBe("Club introuvable");
    const broken = { from: () => { throw new Error("réseau coupé"); } };
    expect((await loadMatchMetadata(broken, "m1")).title).toBe("Match introuvable");
  });
});

describe("branchement des layouts", () => {
  it("pages à contenu : métadonnées lues côté serveur", () => {
    for (const [file, loader] of [["app/players/[id]/layout.js", "loadPlayerMetadata"], ["app/clubs/[id]/layout.js", "loadClubMetadata"], ["app/competitions/[slug]/layout.js", "loadCompetitionMetadata"], ["app/matchs/[id]/layout.js", "loadMatchMetadata"]]) {
      expect(read(file), file).toContain(`return ${loader}(publicServerClient(),`);
    }
  });
  it("sections : sectionMetadata (sans canonique) ; pages légales sans « · Belfoot » en double", () => {
    for (const dir of ["competitions", "diables-rouges", "belges-a-l-etranger", "classement", "direct", "onze", "forum", "recherche", "proposer", "matchs"]) {
      expect(read(`app/${dir}/layout.js`), dir).toContain("export const metadata = sectionMetadata({");
    }
    for (const file of ["app/cgu/page.js", "app/confidentialite/page.js", "app/mentions-legales/page.js"]) expect(read(file)).not.toContain(" · Belfoot\"");
  });
});
