import { describe, expect, it } from "vitest";
import { pickCurrentCoach } from "@/lib/coachPick";
import { coachRefreshCandidate } from "@/lib/campaignRollover";
import { registerProvider } from "@/modules/football/providers";
import { syncCoaches } from "@/modules/football/syncCoaches";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Constat du 27/10/2026 : « N. Hayen » restait l'entraîneur de Club Brugge (569).
const coach = (id, name, career) => ({ id, name, career: career.map(([team, start, end = null]) => ({ team: { id: team }, start, end })) });

describe("entraîneur actuel d'un club", () => {
  it("successeur arrivé après : il l'emporte, même si l'ancien mandat n'est pas encore clôturé par l'API", () => {
    const rows = [coach(1, "N. Hayen", [[569, "2024-03-01"]]), coach(2, "Nouveau coach", [[569, "2026-10-20"], [741, "2023-01-01", "2026-06-30"]])];
    expect(pickCurrentCoach(rows, 569)).toMatchObject({ status: "current", coach: { name: "Nouveau coach" } });
  });
  it("mandat clôturé : jamais affiché ; aucun mandat ouvert : poste vacant ; rien de connu : inconnu", () => {
    expect(pickCurrentCoach([coach(1, "N. Hayen", [[569, "2024-03-01", "2026-10-15"]]), coach(2, "Adjoint", [[569, "2026-10-16"]])], 569).coach.name).toBe("Adjoint");
    expect(pickCurrentCoach([coach(1, "N. Hayen", [[569, "2024-03-01", "2026-10-15"]])], 569)).toEqual({ status: "vacant" });
    expect(pickCurrentCoach([coach(3, "Ailleurs", [[741, "2025-05-01"]])], 569)).toEqual({ status: "unknown" });
    expect(pickCurrentCoach([], 569)).toEqual({ status: "unknown" });
  });
  it("carrière dans ce club seulement (mandat ouvert ailleurs ignoré)", () => {
    const rows = [coach(1, "Parti", [[569, "2022-01-01", "2024-01-01"], [741, "2024-02-01"]])];
    expect(pickCurrentCoach(rows, "569")).toEqual({ status: "vacant" });
  });
});

describe("vérification planifiée", () => {
  const NOW = Date.parse("2026-10-27T12:00:00Z");
  const days = (n) => new Date(NOW - n * 86400000).toISOString();
  it("lot en cours d'abord, sinon la plus ancienne échue (7 jours), sinon rien", () => {
    expect(coachRefreshCandidate(["a", "b"], { a: { checkedAt: days(30) }, b: { checkedAt: days(1), clubIndex: 4 } }, NOW)).toBe("b");
    expect(coachRefreshCandidate(["a", "b", "c"], { a: { checkedAt: days(8) }, b: { checkedAt: days(10) }, c: { checkedAt: days(2) } }, NOW)).toBe("b");
    expect(coachRefreshCandidate(["a"], {}, NOW)).toBe("a");
    expect(coachRefreshCandidate(["a"], { a: { checkedAt: days(6) } }, NOW)).toBeNull();
  });
});

describe("synchro des entraîneurs : poste vacant", () => {
  it("ancien entraîneur détaché du club ; saisie manuelle (verrouillée) protégée", async () => {
    registerProvider({ key: "testprov", async fetchCurrentCoach() { return { vacant: true }; } });
    const competition = { id: "c-144", name: "Pro League", provider: "testprov", ext: { season: "2026" } };
    const db = createFakeSupabase({
      competitions: [competition],
      seasons: [{ id: "s-1", competition_id: "c-144", label: "2026-2027" }],
      matches: [{ id: "m-1", competition_id: "c-144", season_id: "s-1", home_club_id: "brugge", away_club_id: "gent" }],
      clubs: [{ id: "brugge", name: "Club Brugge KV", external_id: "569" }, { id: "gent", name: "Gent", external_id: "631" }],
      coaches: [
        { id: "hayen", source: "testprov", external_id: "1", name: "N. Hayen", club_id: "brugge", locked: false },
        { id: "manuel", source: "manual", external_id: null, name: "Saisi à la main", club_id: "gent", locked: true },
      ],
    });
    const result = await syncCoaches(db, competition, { season: "2026-2027" });
    expect(db.rows("coaches").find((row) => row.id === "hayen").club_id).toBeNull();
    expect(db.rows("coaches").find((row) => row.id === "manuel").club_id).toBe("gent");
    expect(result.detail).toMatch(/1 postes vacants/);
  });
});
