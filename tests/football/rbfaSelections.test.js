import { describe, expect, it } from "vitest";
import { compareRbfaSelection, parseRbfaSelection } from "@/modules/football/rbfaSelections";

const entry = (id, name, date, club) => `<TD><CENTER><A HREF=/project/publiek/jrinterfr/speler_PH_${id}.htm><IMG SRC=x></CENTER><BR><CENTER>${name}<BR>${date}<BR>${club}<BR></A></TD>`;
const rbfa = [{ sourceId: "1", name: "Hugo Cuypers", birthDate: "1997-02-07", club: "Monterrey" }];

describe("lecture et comparaison des listes RBFA", () => {
  it("lit les pages RBFA même si les balises sont mal imbriquées", () => {
    expect(parseRbfaSelection(entry("1", "Hugo Cuypers", "07-02-1997", "Monterrey"), { minimum: 1 })).toEqual(rbfa);
  });
  it("lit également les fiches des Red Flames", () => {
    const html = entry("1", "Joueuse Exemple", "07-02-1997", "Club").replace("speler_PH_", "speler_PF_");
    expect(parseRbfaSelection(html, { minimum: 1 })[0]).toMatchObject({ sourceId: "1", name: "Joueuse Exemple" });
  });
  it("refuse les listes vides, incomplètes, les doublons et les dates invalides", () => {
    expect(() => parseRbfaSelection("indisponible")).toThrow(/incomplète/);
    expect(() => parseRbfaSelection(entry("1", "Hugo Cuypers", "07-02-1997", "Club").repeat(2), { minimum: 1 })).toThrow(/ambiguë/);
    expect(() => parseRbfaSelection(entry("1", "Hugo Cuypers", "31-02-1997", "Club"), { minimum: 1 })).toThrow(/invalide/);
    expect(() => parseRbfaSelection(entry("1", "Hugo Cuypers", "07-02-1997", "Club") + '<a href="/project/publiek/jrinterfr/speler_PH_2.htm"></a>', { minimum: 1 })).toThrow(/incomplète/);
  });
  it("exige une date et un nom cohérents avant de proposer une correspondance", () => {
    const result = compareRbfaSelection(rbfa, [{ id: "p1", name: "H. Cuypers", birth_date: "1997-02-07" }], ["p-old"]);
    expect(result).toMatchObject({ complete: true, additions: [{ playerId: "p1" }], removals: ["p-old"] });
    expect(compareRbfaSelection(rbfa, [{ id: "p1", name: "H. Cuypers", birth_date: null }], ["p-old"])).toMatchObject({ complete: false, removals: null });
    expect(compareRbfaSelection(rbfa, [{ id: "p1", name: "H. Autre", birth_date: "1997-02-07" }], ["p-old"])).toMatchObject({ complete: false, removals: null });
    expect(compareRbfaSelection(rbfa, [{ id: "p1", name: "Harry Cuypers", birth_date: "1997-02-07" }], [])).toMatchObject({ complete: false, additions: [] });
    expect(compareRbfaSelection(rbfa, [{ id: "p1", name: "Hugo Cuypers", birth_date: "1997-02-07" }], [])).toMatchObject({ complete: true, additions: [{ playerId: "p1" }] });
  });
  it("ne choisit jamais entre homonymes ni deux identités sur la même fiche", () => {
    const one = { id: "p1", name: "H. Cuypers", birth_date: "1997-02-07" };
    expect(compareRbfaSelection(rbfa, [one, { ...one, id: "p2" }], [])).toMatchObject({ complete: false, additions: [], removals: null });
    expect(compareRbfaSelection([...rbfa, { ...rbfa[0], sourceId: "2" }], [one], [])).toMatchObject({ complete: false, additions: [], removals: null });
  });
});

describe("noms de famille composés RBFA", () => {
  const cases = [
    ["Mathias Delorge", "M. Delorge-Knieper", "2004-07-31"],
    ["Lucas Noubi Ngnokam", "L. Noubi", "2005-01-15"],
    ["Richie Sagrado Sebastiao", "R. Sagrado", "2004-01-30"],
  ];
  it.each(cases)("reconnaît %s et %s avec une date exacte", (name, storedName, birthDate) => {
    const official = [{ sourceId: "1", name, birthDate }];
    expect(compareRbfaSelection(official, [{ id: "p", name: storedName, birth_date: birthDate }], []).complete).toBe(true);
    expect(compareRbfaSelection(official, [{ id: "p", name: storedName, birth_date: "2000-01-01" }], []).complete).toBe(false);
  });
  it("refuse d'autres noms composés, les prénoms différents et les doublons", () => {
    const official = [{ sourceId: "1", name: "Mathias Delorge", birthDate: "2004-07-31" }];
    const player = { id: "p", name: "M. Delorge-Knieper", birth_date: "2004-07-31" };
    expect(compareRbfaSelection(official, [{ ...player, name: "Mathieu Delorge-Knieper" }], []).complete).toBe(false);
    expect(compareRbfaSelection(official, [{ ...player, name: "M. Delorgex-Knieper" }], []).complete).toBe(false);
    expect(compareRbfaSelection(official, [player, { ...player, id: "p2" }], []).complete).toBe(false);
    const compound = [{ sourceId: "2", name: "Lucas Noubi Ngnokam", birthDate: "2005-01-15" }];
    expect(compareRbfaSelection(compound, [{ id: "p", name: "L. Noubi Autre", birth_date: "2005-01-15" }], []).complete).toBe(false);
  });
});
