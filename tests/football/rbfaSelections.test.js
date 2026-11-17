import { describe, expect, it } from "vitest";
import { compareRbfaSelection, parseRbfaSelection } from "@/modules/football/rbfaSelections";

const entry = (id, name, date, club) => `<TD><CENTER><A HREF=/project/publiek/jrinterfr/speler_PH_${id}.htm><IMG SRC=x></CENTER><BR><CENTER>${name}<BR>${date}<BR>${club}<BR></A></TD>`;
const rbfa = [{ sourceId: "1", name: "Hugo Cuypers", birthDate: "1997-02-07", club: "Monterrey" }];

describe("lecture et comparaison des listes RBFA", () => {
  it("lit les pages RBFA même si les balises sont mal imbriquées", () => {
    expect(parseRbfaSelection(entry("1", "Hugo Cuypers", "07-02-1997", "Monterrey"), { minimum: 1 })).toEqual(rbfa);
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
  });
  it("ne choisit jamais entre homonymes ni deux identités sur la même fiche", () => {
    const one = { id: "p1", name: "H. Cuypers", birth_date: "1997-02-07" };
    expect(compareRbfaSelection(rbfa, [one, { ...one, id: "p2" }], [])).toMatchObject({ complete: false, additions: [], removals: null });
    expect(compareRbfaSelection([...rbfa, { ...rbfa[0], sourceId: "2" }], [one], [])).toMatchObject({ complete: false, additions: [], removals: null });
  });
});
