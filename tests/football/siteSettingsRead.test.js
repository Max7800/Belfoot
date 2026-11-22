import { describe, expect, it, vi } from "vitest";
import { readSiteSettings } from "@/lib/siteSettingsRead";

describe("lecture partagée des paramètres du site", () => {
  it("partage les lectures simultanées puis relit les nouvelles valeurs", async () => {
    let resolve;
    const deferred = new Promise((done) => { resolve = done; });
    const maybeSingle = vi.fn().mockReturnValueOnce(deferred).mockResolvedValueOnce({ data: { data: { version: 2 } } });
    const db = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) };
    const first = readSiteSettings(db);
    const second = readSiteSettings(db);
    expect(db.from).toHaveBeenCalledTimes(1);
    resolve({ data: { data: { version: 1 } } });
    expect(await first).toEqual(await second);
    expect((await readSiteSettings(db)).data.data.version).toBe(2);
    expect(db.from).toHaveBeenCalledTimes(2);
  });

  it("permet une nouvelle lecture après une erreur", async () => {
    const maybeSingle = vi.fn().mockRejectedValueOnce(new Error("indisponible")).mockResolvedValueOnce({ data: null });
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
    await expect(readSiteSettings(db)).rejects.toThrow("indisponible");
    await expect(readSiteSettings(db)).resolves.toEqual({ data: null });
  });
});
