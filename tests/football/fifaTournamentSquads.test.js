import { beforeEach, describe, expect, it, vi } from "vitest";
import { fifaU17Snapshot, FIFA_U17_TEAM_ID, FIFA_U17_COMPETITION_ID } from "@/lib/fifaTournamentRoster";
const state = vi.hoisted(() => ({ current: {} }));
vi.mock("@/lib/siteSettings", () => ({ updateSiteSettings: async (_db, patch) => { const result = patch(state.current); if (!result) return null; return state.current = { ...state.current, ...result }; } }));
const { parseBelgiumPage, syncFifaTournamentSquad, FIFA_U17_KEY } = await import("@/modules/football/fifaTournamentSquads");
const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });
const fixture = () => {
 const headers = ["#", "POS", "PLAYER NAME", "FIRST NAME(S)", "LAST NAME(S)", "NAME ON SHIRT", "DOB", "CLUB", "HEIGHT (CM)"];
 const items = [item("Belgium (BEL)", 200, 285), item("FIFA U-17 World Cup Qatar 2026™", 10, 306), item("Saturday, 21 November 2026 | 11:55 UTC | Version 1 | Page 4 / 48", 170, 50), ...headers.map((x,i)=>item(x,i*40+8,278))];
 for (let i=1; i<=21; i++) { const y=278-i*5; const cells = [String(i), i<4?"GK":"DF", `PLAYER${i} Name`, `Name${i}`, `PLAYER${i}`, `PLAYER${i}`, `01/01/2009`, "Club (BEL)", "180"]; items.push(...cells.map((x,j)=>item(x,j*40+8,y))); }
 return items;
};
const now = new Date("2026-11-21T14:00:00Z");
beforeEach(() => { state.current = {}; });
describe("liste FIFA U17", () => {
 it("lit les lignes, la date et la version de la Belgique", () => { const result = parseBelgiumPage(fixture()); expect(result.players).toHaveLength(21); expect(result.versionAt).toBe("2026-11-21T11:55:00.000Z"); expect(result.players[0]).toMatchObject({shirt:1,position:"Goalkeeper",birthDate:"2009-01-01"}); });
 it("rejette une liste tronquée ou une autre équipe", () => { const short = fixture().filter((x)=>x.transform[5] !== 173); expect(()=>parseBelgiumPage(short)).toThrow(); expect(()=>parseBelgiumPage(fixture().filter((x)=>x.str !== "Belgium (BEL)"))).toThrow(); });
 it("sauve une liste valide puis conserve le snapshot en cas de panne", async () => { const reader = vi.fn(async()=>parseBelgiumPage(fixture())); const fetcher = vi.fn(async()=>new Response("PDF")); expect(await syncFifaTournamentSquad(null,{}, {now, reader, fetcher})).toMatchObject({ok:true,players:21}); const saved=state.current[FIFA_U17_KEY]; expect(saved.players).toHaveLength(21); expect(await syncFifaTournamentSquad(null,state.current,{now,reader,fetcher})).toMatchObject({skipped:true}); const tomorrow=new Date(now.getTime()+86400000); const failed=await syncFifaTournamentSquad(null,state.current,{now:tomorrow,fetcher:async()=>new Response("",{status:503})}); expect(failed.ok).toBe(false); expect(state.current[FIFA_U17_KEY].players).toEqual(saved.players); });
 it("archive après le tournoi sans appel et conserve la liste liée à l’édition", async () => { const fetcher=vi.fn(); const after=new Date("2026-12-29T00:00:00Z"); expect(await syncFifaTournamentSquad(null,{ [FIFA_U17_KEY]: { players: parseBelgiumPage(fixture()).players } }, {now:after,fetcher})).toMatchObject({skipped:true}); expect(fetcher).not.toHaveBeenCalled(); const snapshot={players:parseBelgiumPage(fixture()).players,version:"v1",observedAt:now.toISOString()}; const settings={[FIFA_U17_KEY]:snapshot}; expect(fifaU17Snapshot(settings,{teamId:FIFA_U17_TEAM_ID,current:true,now:after.getTime()})).toBeNull(); expect(fifaU17Snapshot(settings,{teamId:FIFA_U17_TEAM_ID,competitionId:FIFA_U17_COMPETITION_ID,season:"2026-2027",now:after.getTime()})).toEqual(snapshot); expect(fifaU17Snapshot(settings,{teamId:FIFA_U17_TEAM_ID,competitionId:FIFA_U17_COMPETITION_ID,season:"2025-2026"})).toBeNull(); });

 it("reprend après le tournoi si aucune archive valide n'a pu être enregistrée", async () => { const after=new Date("2026-12-29T00:00:00Z"); const reader=async()=>parseBelgiumPage(fixture()); const result=await syncFifaTournamentSquad(null,{}, {now:after,reader,fetcher:async()=>new Response("PDF")}); expect(result).toMatchObject({ok:true,players:21}); });
 it("refuse d'écraser une version plus récente", async () => { state.current={[FIFA_U17_KEY]:{versionAt:"2026-11-22T11:00:00.000Z",players:[{name:"conservé"}]}}; const reader=async()=>parseBelgiumPage(fixture()); const result=await syncFifaTournamentSquad(null,state.current,{now:new Date("2026-11-23T14:00:00Z"),reader,fetcher:async()=>new Response("PDF")}); expect(result.ok).toBe(false); expect(state.current[FIFA_U17_KEY].players).toEqual([{name:"conservé"}]); });
});
