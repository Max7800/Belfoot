import { describe, expect, it } from "vitest";
import { publicPageStatus } from "@/lib/publicPageStatus";

describe("chargement des pages de compétition", () => {
  const base = { competitionsLoading: false, loading: false, cid: "a", seasonOwner: "a", error: "", unpublished: false, competitionCount: 1 };
  it("attend la sélection et ses données, sans afficher une ancienne compétition", () => {
    expect(publicPageStatus({ ...base, competitionsLoading: true, cid: "", competitionCount: 0 })).toBe("loading");
    expect(publicPageStatus({ ...base, cid: "b", seasonOwner: "a" })).toBe("loading");
    expect(publicPageStatus({ ...base, loading: true })).toBe("loading");
    expect(publicPageStatus(base)).toBe("ready");
  });
  it("distingue erreurs, saison non publiée et absence réelle de compétition", () => {
    expect(publicPageStatus({ ...base, error: "erreur" })).toBe("error");
    expect(publicPageStatus({ ...base, unpublished: true })).toBe("unpublished");
    expect(publicPageStatus({ ...base, cid: "", seasonOwner: "", competitionCount: 0 })).toBe("empty");
  });
});
