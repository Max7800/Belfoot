import { describe, expect, it } from "vitest";
import { parseFifaU17RoundOf32 } from "@/modules/football/fifaU17DrawParser";

const day1 = ["Croatia|Uruguay", "Italy|Tajikistan", "Brazil|Mozambique", "Belgium|Saudi Arabia", "Republic of Ireland|Côte d'Ivoire", "Mexico|Argentina", "Chile|Morocco", "Spain|Uzbekistan"];
const day2 = ["Australia|Senegal", "Mali|Dominican Republic", "Korea Republic|Japan", "Serbia|China PR", "Greece|Ecuador", "Egypt|Colombia", "France|Uganda", "Venezuela|Algeria"];
const section = (day, rows) => `<h3><span>${day}</span><span>${day}</span></h3><p>${rows.map((row, i) => `<strong>${row.replace("|", " v ")}</strong>, ${i === 3 ? "16:30" : "15:30"}<em>, Pitch 1</em>`).join("<br>")}</p>`;
const article = `<h1>Round of 32 match-ups confirmed at U-17 World Cup</h1><p>FIFA U-17 World Cup Qatar 2026</p>${section("Monday, 30 November", day1)}${section("Tuesday, 1 December", day2)}`;

describe("lecture de la publication FIFA U17", () => {
  it("extrait 16 affiches uniques et convertit l'heure du Qatar en UTC", () => {
    const fixtures = parseFifaU17RoundOf32(article);
    expect(fixtures).toHaveLength(16);
    expect(fixtures[3]).toEqual({ home: "Belgium", away: "Saudi Arabia", kickoff: "2026-11-30T13:30:00.000Z" });
  });
  it("refuse une page sans affiches, une équipe en double et un horaire impossible", () => {
    expect(() => parseFifaU17RoundOf32("<h1>Round of 32</h1>")).toThrow();
    expect(() => parseFifaU17RoundOf32(article.replace("Croatia v Uruguay", "Belgium v Uruguay"))).toThrow();
    expect(() => parseFifaU17RoundOf32(article.replace("16:30", "28:30"))).toThrow();
  });
});
