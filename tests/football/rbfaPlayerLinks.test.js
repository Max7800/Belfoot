import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { resolveRbfaPlayerLinks } from "@/modules/football/rbfaPlayerLinks";

const official = [
  { sourceId: "1", name: "Hugo Cuypers", birthDate: "1997-02-07", club: "Monterrey" },
  { sourceId: "2", name: "Jules Homonyme", birthDate: "2000-01-02", club: "Club" },
  { sourceId: "3", name: "Jean Absent", birthDate: "2001-01-03", club: "Club" },
];

describe("liaison des fiches RBFA", () => {
  it("relie une fiche unique et écarte homonymes et joueurs inconnus sans écrire", async () => {
    const players = [
      { id: "p1", name: "H. Cuypers", birth_date: "1997-02-07", club_id: "club1" },
      { id: "p2", name: "J. Homonyme", birth_date: "2000-01-02" },
      { id: "p3", name: "Jules Homonyme", birth_date: "2000-01-02" },
      { id: "p4", name: "Jean Absent", birth_date: "2001-01-04" },
    ];
    const db = createFakeSupabase({ players });
    expect([...await resolveRbfaPlayerLinks(db, official)]).toEqual([["1", "p1"]]);
    expect(db.rows("players")).toEqual(players);
  });
  it("ne relie pas deux identités RBFA à une même fiche", async () => {
    const db = createFakeSupabase({ players: [{ id: "p1", name: "H. Cuypers", birth_date: "1997-02-07" }] });
    expect((await resolveRbfaPlayerLinks(db, [official[0], { ...official[0], sourceId: "9" }])).size).toBe(0);
  });
});
