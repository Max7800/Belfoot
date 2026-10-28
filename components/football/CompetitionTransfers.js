"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { seasonYear } from "@/modules/football/season";
import { readAll, readChunks } from "@/lib/readAll";
import { dedupeTransfers } from "@/lib/transferLabels";
import { chunkIds, loadPlayersByIds } from "@/lib/publicFootballData";
import { matchesTransferQuery, summarizeTransfers } from "@/lib/transfersView";

// Page Transferts : bilan chiffré, vue par club (par défaut) ou fil chronologique.
// Refonte après l'audit du 28/10/2026 (lib/transfersView.js).
const KIND_STYLE = { loan: "bg-amber-400/15 text-amber-200", loan_return: "bg-sky-400/15 text-sky-200", free: "bg-emerald-400/10 text-emerald-200", transfer: "bg-white/[0.06] text-content", end: "bg-slate-400/15 text-slate-300", unknown: "bg-white/[0.04] text-muted" };
const DIR_STYLE = { in: ["Arrivée", "bg-emerald-500/15 text-emerald-300"], out: ["Départ", "bg-red-500/15 text-red-300"], internal: ["Interne", "bg-surface2 text-muted"], other: ["Autre", "bg-surface2 text-muted"] };
// Vue par club : 5 lignes par colonne (Anderlecht : 47 mouvements en 2026), dépliables.
const FOLDED_LINES = 5;
const fmtDate = (value) => { const date = new Date(`${String(value || "").slice(0, 10)}T12:00:00`); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-BE", { day: "numeric", month: "short" }); };

function ClubLogo({ club, className = "h-4 w-4" }) {
  return club?.logo_url ? <img src={club.logo_url} alt="" loading="lazy" decoding="async" className={`${className} flex-shrink-0 object-contain`} /> : <span className={`${className} flex-shrink-0 rounded-full bg-white/[0.06]`} />;
}

function PlayerAvatar({ photo }) {
  return photo ? <img src={photo} alt="" loading="lazy" decoding="async" className="h-9 w-9 flex-shrink-0 rounded-full bg-surface2 object-cover" /> : <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface2 text-sm">👤</span>;
}

function ClubName({ id, name, clubs }) {
  if (!name) return <span className="italic">Sans club</span>;
  const club = id ? clubs[id] : null;
  const content = <><ClubLogo club={club} /><span className="truncate">{name}</span></>;
  return club ? <Link href={`/clubs/${club.id}`} className="inline-flex min-w-0 items-center gap-1 hover:text-accent">{content}</Link> : <span className="inline-flex min-w-0 items-center gap-1">{content}</span>;
}

function TransferLine({ item, clubs, photos, side = null }) {
  // Vue par club : seul l'autre club est utile (« de Portsmouth », « vers Puebla »).
  const other = side === "in" ? { id: item.from_club_id, name: item.from, prefix: "de" } : side === "out" ? { id: item.to_club_id, name: item.to, prefix: "vers" } : null;
  return (
    <div className="flex items-center gap-2.5 py-2">
      <PlayerAvatar photo={photos[item.player_id]} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{item.player_id ? <Link href={`/players/${item.player_id}`} className="hover:text-accent">{item.player_name}</Link> : item.player_name}</div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          {other ? <><span className="flex-shrink-0">{other.prefix}</span><ClubName id={other.id} name={other.name} clubs={clubs} /></>
            : <><ClubName id={item.from_club_id} name={item.from} clubs={clubs} /><ArrowRight className="h-3 w-3 flex-shrink-0" /><ClubName id={item.to_club_id} name={item.to} clubs={clubs} /></>}
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        {item.label && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_STYLE[item.kind]}`}>{item.label}</span>}
        <span className="text-[10px] text-muted">{fmtDate(item.transfer_date)}</span>
      </div>
    </div>
  );
}

export default function CompetitionTransfers({ competition }) {
  const [year, setYear] = useState(() => Number(seasonYear(competition?.ext?.season)) || new Date().getFullYear());
  const [years, setYears] = useState([]);
  const [rows, setRows] = useState([]);
  const [clubIds, setClubIds] = useState(() => new Set());
  const [clubs, setClubs] = useState({});
  const [photos, setPhotos] = useState({});
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("clubs");
  const [filter, setFilter] = useState("all");
  const [clubFilter, setClubFilter] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleClub = (id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  useEffect(() => {
    if (!competition?.id) return;
    supabase.from("seasons").select("label").eq("competition_id", competition.id).then(({ data }) => {
      const ys = [...new Set((data || []).map((s) => Number(seasonYear(s.label))).filter(Boolean))].sort((a, b) => b - a);
      if (ys.length) { setYears(ys); setYear((prev) => (ys.includes(prev) ? prev : ys[0])); }
    });
  }, [competition?.id]);

  useEffect(() => {
    if (!competition?.id || !year) return;
    setLoading(true); setClubFilter("");
    (async () => {
      const { data: seasonRows } = await supabase.from("seasons").select("id,label").eq("competition_id", competition.id);
      const seasonRow = (seasonRows || []).find((s) => Number(seasonYear(s.label)) === year);
      const { data: matches } = await readAll(() => {
        const query = supabase.from("matches").select("id,home_club_id,away_club_id").eq("competition_id", competition.id);
        return seasonRow?.id ? query.eq("season_id", seasonRow.id) : query;
      });
      const ids = new Set((matches || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean));
      setClubIds(ids);
      if (!ids.size) { setRows([]); setClubs({}); setPhotos({}); setLoading(false); return; }
      const idList = [...ids].join(",");
      const { data } = await readAll(() => supabase.from("player_transfers")
        .select("id,player_id,player_name,from_club_id,to_club_id,from_club_name,to_club_name,transfer_date,transfer_type")
        .eq("season_start_year", year)
        .or(`from_club_id.in.(${idList}),to_club_id.in.(${idList})`)
        .order("transfer_date", { ascending: false }));
      const list = dedupeTransfers(data || []);
      setRows(list);
      // Logos des clubs des deux côtés et photos des joueurs, par paquets (URL bornée).
      const clubKeys = [...new Set([...ids, ...list.flatMap((t) => [t.from_club_id, t.to_club_id])].filter(Boolean))];
      const playerIds = [...new Set(list.map((t) => t.player_id).filter(Boolean))];
      const [clubResult, players] = await Promise.all([
        readChunks(chunkIds(clubKeys), (chunk) => supabase.from("clubs").select("id,name,logo_url").in("id", chunk)),
        loadPlayersByIds(supabase, playerIds),
      ]);
      setClubs(Object.fromEntries((clubResult.data || []).map((club) => [club.id, club])));
      setPhotos(Object.fromEntries(players.map((player) => [player.id, player.photo_url])));
      setLoading(false);
    })().catch(() => { setRows([]); setLoading(false); });
  }, [competition?.id, year]);

  const summary = useMemo(() => summarizeTransfers(rows, clubIds), [rows, clubIds]);
  const searched = useMemo(() => summary.items.filter((item) => matchesTransferQuery(item, query)), [summary, query]);
  const feed = useMemo(() => searched.filter((item) => {
    if (filter === "in" && !(item.dir === "in" || item.dir === "internal")) return false;
    if (filter === "out" && !(item.dir === "out" || item.dir === "internal")) return false;
    if (clubFilter && item.from_club_id !== clubFilter && item.to_club_id !== clubFilter) return false;
    return true;
  }), [searched, filter, clubFilter]);
  const visibleIds = useMemo(() => new Set(searched.map((item) => item.id)), [searched]);
  const clubCards = useMemo(() => summary.clubs
    .filter((card) => !clubFilter || card.clubId === clubFilter)
    .map((card) => ({ ...card, arrivals: card.arrivals.filter((item) => visibleIds.has(item.id)), departures: card.departures.filter((item) => visibleIds.has(item.id)) }))
    .filter((card) => !query || card.arrivals.length || card.departures.length), [summary, clubFilter, visibleIds, query]);
  const clubOptions = useMemo(() => [...clubIds].map((id) => clubs[id]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "fr")), [clubIds, clubs]);
  const seasonText = `${year}-${year + 1}`;

  const tile = (label, value, tone) => <div className="rounded-2xl border border-line/10 bg-surface/70 px-4 py-3"><b className={`block text-2xl font-black ${tone}`}>{value}</b><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span></div>;
  const button = (active) => `rounded px-3 py-1 font-bold ${active ? "bg-accent text-white" : "text-muted hover:text-content"}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tile("Arrivées", loading ? "…" : summary.totals.arrivals, "text-emerald-300")}
        {tile("Départs", loading ? "…" : summary.totals.departures, "text-red-300")}
        {tile("Prêts", loading ? "…" : summary.totals.loans, "text-amber-200")}
        {tile("Libres", loading ? "…" : summary.totals.free, "text-content")}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line/10 bg-surface/60 p-3">
        <div className="flex gap-1 rounded-lg bg-surface2 p-1 text-xs">
          <button type="button" onClick={() => setMode("clubs")} className={button(mode === "clubs")}>Par club</button>
          <button type="button" onClick={() => setMode("feed")} className={button(mode === "feed")}>Fil des transferts</button>
        </div>
        {mode === "feed" && <div className="flex gap-1 rounded-lg bg-surface2 p-1 text-xs">{[["all", "Tous"], ["in", "Arrivées"], ["out", "Départs"]].map(([key, label]) => <button type="button" key={key} onClick={() => setFilter(key)} className={button(filter === key)}>{label}</button>)}</div>}
        <label className="flex min-w-[10rem] flex-1 items-center gap-2 rounded-lg border border-line/10 bg-surface2 px-2.5"><Search className="h-4 w-4 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Joueur ou club…" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none" /></label>
        {clubOptions.length > 0 && <select value={clubFilter} onChange={(event) => setClubFilter(event.target.value)} aria-label="Club" className="rounded-lg border border-line/10 bg-surface2 px-2 py-1.5 text-sm"><option value="">Tous les clubs</option>{clubOptions.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select>}
        {years.length > 1 && <select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Saison" className="rounded-lg border border-line/10 bg-surface2 px-2 py-1.5 text-sm">{years.map((y) => <option key={y} value={y}>{y}–{Number(y) + 1}</option>)}</select>}
      </div>

      {loading ? <p className="py-6 text-center text-sm text-muted">Chargement des transferts…</p>
        : !rows.length ? <p className="rounded-2xl border border-line/10 bg-surface/60 py-8 text-center text-sm text-muted">Aucun transfert importé pour la saison {seasonText}.</p>
        : mode === "clubs" ? (
          clubCards.length === 0 ? <p className="py-6 text-center text-sm text-muted">Aucun transfert pour cette recherche.</p> : (
            <div className="grid gap-3 lg:grid-cols-2">
              {clubCards.map((card) => {
                const club = clubs[card.clubId];
                const open = expanded.has(card.clubId) || Boolean(query);
                const hidden = open ? 0 : Math.max(0, card.arrivals.length - FOLDED_LINES) + Math.max(0, card.departures.length - FOLDED_LINES);
                const lines = (list) => (open ? list : list.slice(0, FOLDED_LINES));
                return (
                  <section key={card.clubId} className="min-w-0 rounded-2xl border border-line/10 bg-surface/60 p-4">
                    <header className="mb-2 flex items-center gap-2.5">
                      <ClubLogo club={club} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">{club ? <Link href={`/clubs/${club.id}`} className="block truncate font-black hover:text-accent">{club.name}</Link> : <span className="font-black">Club</span>}<span className="text-xs text-muted"><b className="text-emerald-300">{card.arrivals.length}</b> arrivée{card.arrivals.length > 1 ? "s" : ""} · <b className="text-red-300">{card.departures.length}</b> départ{card.departures.length > 1 ? "s" : ""}</span></div>
                    </header>
                    <div className="grid gap-x-4 sm:grid-cols-2">
                      <div className="min-w-0"><div className="border-b border-line/10 pb-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">Arrivées</div>{card.arrivals.length ? <div className="divide-y divide-line/10">{lines(card.arrivals).map((item) => <TransferLine key={item.id} item={item} clubs={clubs} photos={photos} side="in" />)}</div> : <p className="py-2 text-xs text-muted">Aucune</p>}</div>
                      <div className="mt-3 min-w-0 sm:mt-0"><div className="border-b border-line/10 pb-1 text-[10px] font-black uppercase tracking-wider text-red-300">Départs</div>{card.departures.length ? <div className="divide-y divide-line/10">{lines(card.departures).map((item) => <TransferLine key={item.id} item={item} clubs={clubs} photos={photos} side="out" />)}</div> : <p className="py-2 text-xs text-muted">Aucun</p>}</div>
                    </div>
                    {(hidden > 0 || (expanded.has(card.clubId) && !query)) && <button type="button" onClick={() => toggleClub(card.clubId)} className="mt-2 w-full rounded-lg border border-line/15 px-3 py-2 text-xs font-bold text-muted transition hover:border-accent/40 hover:text-content">{hidden > 0 ? `Voir les ${hidden} autre${hidden > 1 ? "s" : ""} mouvement${hidden > 1 ? "s" : ""}` : "Réduire"}</button>}
                  </section>
                );
              })}
            </div>
          )
        ) : (
          <div className="rounded-2xl border border-line/10 bg-surface/60 px-4 py-2">
            {feed.length === 0 ? <p className="py-6 text-center text-sm text-muted">Aucun transfert pour ce filtre.</p> : <div className="divide-y divide-line/10">{feed.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5">
                <span className={`hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase sm:inline ${DIR_STYLE[item.dir][1]}`}>{DIR_STYLE[item.dir][0]}</span>
                <div className="min-w-0 flex-1"><TransferLine item={item} clubs={clubs} photos={photos} /></div>
              </div>
            ))}</div>}
          </div>
        )}
    </div>
  );
}
