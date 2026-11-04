import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("migration du palmarès des compétitions", () => {
  it("ajoute une liste vide et conserve les données lorsqu'elle est rejouée", async () => {
    const db = new PGlite();
    try {
      await db.exec("create table competitions (id integer primary key, name text); insert into competitions values (1, 'Test');");
      const sql = await readFile("modules/football/migrations/0042_competition_winners.sql", "utf8");
      await db.exec(sql);
      expect((await db.query("select winners_history from competitions where id = 1")).rows[0].winners_history).toEqual([]);
      await db.query("update competitions set winners_history = $1::jsonb where id = 1", [JSON.stringify([{ season: "2025-2026", winner: "Club" }])]);
      await db.exec(sql);
      expect((await db.query("select winners_history from competitions where id = 1")).rows[0].winners_history).toEqual([{ season: "2025-2026", winner: "Club" }]);
    } finally { await db.close(); }
  }, 30000);
});
