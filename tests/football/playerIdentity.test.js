import { describe, expect, it } from "vitest";
import { belgianWatchStatus, hasBelgianNationality, isBelgianFollowed, isEditorialNationality, providerIdentityPatch } from "@/lib/playerIdentity";

describe("hasBelgianNationality", () => {
  it("reconnaît la nationalité belge quelle que soit sa position ou sa langue", () => {
    for (const value of ["Belgium", "Belgique", "Belgique, Maroc", "Morocco, Belgium", "Maroc / Belgique", "Belgo-marocain"]) {
      expect(hasBelgianNationality(value)).toBe(true);
    }
  });

  it("ne voit pas de Belge là où il n'y en a pas", () => {
    for (const value of [null, undefined, "", "Morocco", "France, Maroc", "Netherlands"]) {
      expect(hasBelgianNationality(value)).toBe(false);
    }
  });
});

describe("providerIdentityPatch", () => {
  it("nouveau joueur : reprend les valeurs du provider", () => {
    expect(providerIdentityPatch(null, { nationality: "Belgium", birth_date: "2004-02-02" })).toEqual({ nationality: "Belgium", birth_date: "2004-02-02" });
    expect(providerIdentityPatch(null, {})).toEqual({ nationality: null, birth_date: null });
  });

  it("valeur API absente ou vide : la valeur connue n'est jamais effacée", () => {
    const existing = { nationality: "Belgium", birth_date: "2003-05-05", ext: {} };
    for (const incoming of [{}, { nationality: null, birth_date: null }, { nationality: "", birth_date: "  " }]) {
      expect(providerIdentityPatch(existing, incoming)).toEqual({});
    }
  });

  it("nationalité fixée dans l'admin : jamais remplacée par une nationalité API différente", () => {
    const existing = { nationality: "Belgique", ext: { editorial_nationality: true } };
    expect(providerIdentityPatch(existing, { nationality: "Morocco" })).toEqual({});
  });

  it("plusieurs nationalités connues : jamais réduites à la seule nationalité API", () => {
    expect(providerIdentityPatch({ nationality: "Belgium, DR Congo", ext: {} }, { nationality: "DR Congo" })).toEqual({});
    expect(providerIdentityPatch({ nationality: "Belgo-marocain", ext: {} }, { nationality: "Morocco" })).toEqual({});
  });

  it("date de naissance fixée dans l'admin : jamais remplacée", () => {
    const existing = { nationality: "Belgium", birth_date: "2004-01-01", ext: { editorial_birth_date: true } };
    expect(providerIdentityPatch(existing, { nationality: "Belgium", birth_date: "2004-02-02" })).toEqual({ nationality: "Belgium" });
  });

  it("données non verrouillées : mise à jour normale par le provider", () => {
    expect(providerIdentityPatch({ nationality: "France", birth_date: null, ext: {} }, { nationality: "Belgium", birth_date: "2001-01-01" }))
      .toEqual({ nationality: "Belgium", birth_date: "2001-01-01" });
  });

  it("isEditorialNationality conserve l'heuristique historique", () => {
    expect(isEditorialNationality({ nationality: "Belgium", ext: {} })).toBe(false);
    expect(isEditorialNationality({ nationality: "Belgique, Maroc", ext: {} })).toBe(true);
    expect(isEditorialNationality({ nationality: "Belgium", ext: { editorial_nationality: true } })).toBe(true);
  });
});

describe("belgianWatchStatus — nationalité ≠ sélection représentée", () => {
  const BELGIUM = { name: "Belgique" };
  const MOROCCO = { name: "Maroc" };

  it("représente la Belgique", () => {
    expect(belgianWatchStatus({ nationality: "Belgium" }, BELGIUM)).toBe("belgium");
  });

  it("Belge représentant une autre sélection : binational à suivre, toujours suivi", () => {
    const player = { nationality: "Belgium, Morocco" };
    expect(belgianWatchStatus(player, MOROCCO)).toBe("binational");
    expect(belgianWatchStatus({ nationality: "Belgium" }, MOROCCO)).toBe("binational");
    expect(isBelgianFollowed(player)).toBe(true);
  });

  it("plusieurs nationalités connues sans sélection : binational", () => {
    expect(belgianWatchStatus({ nationality: "Belgique, RD Congo" })).toBe("binational");
    expect(belgianWatchStatus({ nationality: "Belgo-marocain" })).toBe("binational");
  });

  it("classement manuel « binational à suivre » prioritaire, même si l'API ne connaît qu'une autre nationalité", () => {
    expect(belgianWatchStatus({ nationality: "Morocco", ext: { binational_watch: true } })).toBe("binational");
    expect(belgianWatchStatus({ nationality: "Morocco", binational_watch: true }, BELGIUM)).toBe("binational");
    expect(isBelgianFollowed({ nationality: "Morocco", binational_watch: true })).toBe(true);
  });

  it("Belge sans autre information / joueur sans lien belge", () => {
    expect(belgianWatchStatus({ nationality: "Belgium" })).toBe("belgian");
    expect(belgianWatchStatus({ nationality: "Morocco" }, MOROCCO)).toBeNull();
    expect(isBelgianFollowed({ nationality: "France" })).toBe(false);
  });
});
