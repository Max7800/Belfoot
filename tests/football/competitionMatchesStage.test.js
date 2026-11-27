import { describe, expect, it, vi } from "vitest";
import { competitionTabLoading, loadCompetitionMatchesStage } from "@/lib/competitionMatchesStage";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

describe("chargement anticipé du calendrier", () => {
  it("publie les matchs seulement avec leurs clubs", async () => {
    const clubs = deferred();
    const onReady = vi.fn();
    const task = loadCompetitionMatchesStage({
      loadMatches: async () => [{ id: "match" }],
      loadClubs: () => clubs.promise,
      isCurrent: () => true,
      onReady,
    });
    await Promise.resolve();
    expect(onReady).not.toHaveBeenCalled();
    clubs.resolve({ team: { name: "Belgique" } });
    await task;
    expect(onReady).toHaveBeenCalledWith({ matches: [{ id: "match" }], clubs: { team: { name: "Belgique" } } });
  });

  it("ne publie pas une saison quittée pendant la lecture des clubs", async () => {
    const clubs = deferred();
    const onReady = vi.fn();
    let current = true;
    const task = loadCompetitionMatchesStage({ loadMatches: async () => [{ id: "ancien" }], loadClubs: () => clubs.promise, isCurrent: () => current, onReady });
    await Promise.resolve();
    current = false;
    clubs.resolve({});
    expect(await task).toBeNull();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("n'annonce pas un calendrier vide si la lecture échoue", async () => {
    const onReady = vi.fn();
    await expect(loadCompetitionMatchesStage({ loadMatches: async () => { throw new Error("base indisponible"); }, loadClubs: vi.fn(), isCurrent: () => true, onReady })).rejects.toThrow("base indisponible");
    expect(onReady).not.toHaveBeenCalled();
  });
});


describe("affichage pendant le chargement", () => {
  it.each(["matchs", "classement", "clubs"])("affiche %s dès la fin de lecture des matchs", (tab) => {
    expect(competitionTabLoading({ tab, seasonLoading: true, matchesReady: true, dataError: "" })).toEqual({ showLoader: false, showMatchData: true });
  });
  it("garde les statistiques en attente et ne masque pas une erreur de calendrier", () => {
    expect(competitionTabLoading({ tab: "stats", seasonLoading: true, matchesReady: true, dataError: "" }).showLoader).toBe(true);
    expect(competitionTabLoading({ tab: "matchs", seasonLoading: false, matchesReady: false, dataError: "Erreur" })).toEqual({ showLoader: false, showMatchData: false });
    expect(competitionTabLoading({ tab: "matchs", seasonLoading: false, matchesReady: false, dataError: "" }).showLoader).toBe(true);
  });
});
