import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { clubLabel, isPlayerNamedClub, matchesTransferQuery, summarizeTransfers, transferDirection, transferKind } from "@/lib/transfersView";
import { decodeEntities } from "@/lib/mojibake";
import { transferTypeLabel } from "@/lib/transferLabels";

// Audit de la page Transferts du 28/10/2026 (784 transferts 2026).
describe("nature d'un transfert", () => {
  it("retour de prêt distinct du prêt ; « - » et « End of career » jamais « Définitif »", () => {
    expect(["Return from loan", "Loan", "Free agent", "Transfer", "€ 12M", "End of career", "-", "Raise", null].map(transferKind))
      .toEqual(["loan_return", "loan", "free", "transfer", "transfer", "end", "unknown", "unknown", "unknown"]);
    expect(transferTypeLabel("End of career")).toBe("Fin de carrière");
    expect(transferTypeLabel("-")).toBeNull();
  });
});

describe("clubs « fantômes » (nom du joueur à la place du club)", () => {
  it("« A. Tanghe » → « Tanghe Anton », « Arouna Kone » → « Kone Arouna » : Sans club", () => {
    expect(isPlayerNamedClub("Tanghe Anton", "A. Tanghe")).toBe(true);
    expect(isPlayerNamedClub("Kone Arouna", "Arouna Kone")).toBe(true);
    expect(isPlayerNamedClub("Bande Hassane", "H. Bandé")).toBe(true);
    expect(isPlayerNamedClub("Gomez van Hoogen Samuel", "S. Gomez van Hoogen")).toBe(true);
    expect(clubLabel("Tanghe Anton", "A. Tanghe")).toBeNull();
    expect(clubLabel("", "A. Tanghe")).toBeNull();
  });
  it("vrais clubs gardés, même quand un mot est commun", () => {
    expect(isPlayerNamedClub("KRC Genk", "A. Tanghe")).toBe(false);
    expect(isPlayerNamedClub("Union St. Gilloise", "K. Union")).toBe(false);
    expect(isPlayerNamedClub("Real Madrid", "")).toBe(false);
    expect(isPlayerNamedClub("AC Milan", "J. Milan")).toBe(false);
    expect(isPlayerNamedClub("Yameogo Abdoul", "B. Yameogo")).toBe(true);
    expect(isPlayerNamedClub("Lokembo Lokaso Kilian", "K. Lokembo")).toBe(true);
    expect(isPlayerNamedClub("Coppens Jo", "J. Coppens")).toBe(true);
    expect(isPlayerNamedClub("Genk FC", "T. Genk")).toBe(false);
    expect(isPlayerNamedClub("Vitinha Brasil", "Vitinha")).toBe(false); // nom seul, sans initiale : pas la forme « Nom Prénom »
    expect(isPlayerNamedClub("Coppens Jo Ann Marie", "J. Coppens")).toBe(false); // trois prénoms : au-delà de la forme relevée
    expect(isPlayerNamedClub("Milan Futuro Lab Uno", "J. Milan")).toBe(false);
    expect(isPlayerNamedClub("Tanghe", "Anton Tanghe")).toBe(false);
    expect(clubLabel("Tanghe Anton", "A. Tanghe", "club-relie")).toBe("Tanghe Anton");
    expect(clubLabel(" Puebla ", "H. Jurado")).toBe("Puebla");
  });
});

describe("bilan de la compétition", () => {
  const ids = new Set(["genk", "ohl", "cercle"]);
  const t = (id, from, to, type, extra = {}) => ({ id, player_name: `Joueur ${id}`, from_club_id: from, to_club_id: to, from_club_name: from || "Ailleurs", to_club_name: to || "Ailleurs", transfer_type: type, transfer_date: "2026-09-01", ...extra });
  const rows = [t("1", "genk", "ohl", "Loan"), t("2", "x", "cercle", "Free agent"), t("3", "cercle", null, "Transfer"), t("4", "y", "z", "Transfer"), t("5", "ohl", "w", "Return from loan")];
  it("sens : interne, arrivée, départ, autre", () => {
    expect(rows.map((row) => transferDirection(row, ids))).toEqual(["internal", "in", "out", "other", "out"]);
  });
  it("totaux : un mouvement interne compte en arrivée ET en départ ; prêts et libres hors mouvements étrangers", () => {
    const summary = summarizeTransfers([...rows, t("6", "y", "z", "Loan")], ids);
    expect(summary.totals).toEqual({ arrivals: 2, departures: 3, loans: 1, free: 1 });
  });
  it("par club : arrivées et départs rangés, clubs les plus actifs d'abord, club sans mouvement gardé", () => {
    const summary = summarizeTransfers(rows, new Set([...ids, "calme"]));
    const byId = Object.fromEntries(summary.clubs.map((card) => [card.clubId, card]));
    expect(byId.ohl.arrivals.map((item) => item.id)).toEqual(["1"]);
    expect(byId.ohl.departures.map((item) => item.id)).toEqual(["5"]);
    expect(byId.genk.departures.map((item) => item.id)).toEqual(["1"]);
    expect(summary.clubs.map((card) => card.clubId)).toEqual(["ohl", "cercle", "genk", "calme"]); // 2, 2, 1, 0 mouvements
    expect(summary.items.find((item) => item.id === "5")).toMatchObject({ kind: "loan_return", label: "Retour de prêt" });
  });
  it("recherche : joueur ou club, sans accents ni majuscules, début de mot", () => {
    const item = { player_name: "S. Stanojlović", from_club_name: "Charleroi", to_club_name: "Radnik Bijeljina" };
    expect(matchesTransferQuery(item, "stanojlo")).toBe(true);
    expect(matchesTransferQuery(item, "CHARLE")).toBe(true);
    expect(matchesTransferQuery(item, "radnik charleroi")).toBe(true);
    expect(matchesTransferQuery(item, "genk")).toBe(false);
    expect(matchesTransferQuery(item, "  ")).toBe(true);
  });
});

describe("page Transferts : branchements", () => {
  const component = fs.readFileSync("components/football/CompetitionTransfers.js", "utf8");
  it("bilan et clubs calculés par lib/transfersView ; libellé « Sans club » ; vue par club par défaut", () => {
    expect(component).toContain("summarizeTransfers(rows, clubIds)");
    expect(component).toContain("Sans club");
    expect(component).toContain('useState("clubs")');
  });
  it("logos et photos lus par paquets (plus de liste d'identifiants sans borne dans l'URL)", () => {
    expect(component).toContain("readChunks(chunkIds(clubKeys)");
    expect(component).toContain("loadPlayersByIds(supabase, playerIds)");
    expect(component).not.toContain('from("players").select("id,photo_url").in("id", pids)');
  });
  it("saison sans données : message explicite", () => {
    expect(component).toContain("Aucun transfert importé pour la saison {seasonText}.");
  });
});

describe("données brutes de l'API", () => {
  it("entités HTML décodées : « M. N&apos;Diaye » → « M. N'Diaye »", () => {
    expect(decodeEntities("M. N&apos;Diaye")).toBe("M. N'Diaye");
    expect(decodeEntities("A &amp; B &quot;C&quot; &#39;D&#39;")).toBe(`A & B "C" 'D'`);
    expect(decodeEntities(null)).toBeNull();
    const [item] = summarizeTransfers([{ id: "1", player_name: "D. O&apos;Shea", from_club_name: "Burnley", to_club_name: "Ipswich", transfer_type: "Transfer" }], new Set()).items;
    expect(item.player_name).toBe("D. O'Shea");
  });
  it("même club des deux côtés : écarté (6 cas relevés, ex. KVC Westerlo → KVC Westerlo)", () => {
    const rows = [
      { id: "a", player_name: "P. Bibout", from_club_id: "wes", to_club_id: "wes", from_club_name: "KVC Westerlo", to_club_name: "KVC Westerlo", transfer_type: "-" },
      { id: "b", player_name: "X", from_club_id: null, to_club_id: null, from_club_name: "Ailleurs", to_club_name: "Ailleurs", transfer_type: "-" },
      { id: "c", player_name: "Y", from_club_id: null, to_club_id: null, from_club_name: "", to_club_name: "", transfer_type: "Free agent" },
      { id: "d", player_name: "Z", from_club_id: "wes", to_club_id: "gnk", from_club_name: "KVC Westerlo", to_club_name: "Genk", transfer_type: "Transfer" },
    ];
    const summary = summarizeTransfers(rows, new Set(["wes", "gnk"]));
    expect(summary.items.map((item) => item.id)).toEqual(["c", "d"]);
    expect(summary.clubs.find((card) => card.clubId === "wes").arrivals).toEqual([]);
  });
  it("cartes contenues sur mobile et images différées", () => {
    const component = fs.readFileSync("components/football/CompetitionTransfers.js", "utf8");
    expect(component).toContain('<section key={card.clubId} className="min-w-0 rounded-2xl');
    expect(component.match(/loading="lazy"/g)).toHaveLength(2);
  });
});

describe("vue par club : colonnes repliées", () => {
  it("5 lignes par colonne, dépliables ; une recherche montre tout", () => {
    const component = fs.readFileSync("components/football/CompetitionTransfers.js", "utf8");
    expect(component).toContain("const FOLDED_LINES = 5;");
    expect(component).toContain("const open = expanded.has(card.clubId) || Boolean(query);");
    expect(component).toContain("{lines(card.arrivals).map((item) => <TransferLine");
    expect(component).toContain("{lines(card.departures).map((item) => <TransferLine");
  });
});
