import { getProvider } from "./providers";
import { upsertExternal } from "./sync";
import { ensureSeason, seasonLabel, seasonYear } from "./season";

function parseRound(raw) {
  if (!raw) return { round_raw: null, phase: null, round_number: null };
  const str = String(raw).trim();
  const parts = str.split(" - ");
  const last = parts[parts.length - 1].trim();
  if (parts.length >= 2 && /^\d+$/.test(last)) {
    return { round_raw: str, phase: parts.slice(0, -1).join(" - ").trim(), round_number: Number(last) };
  }
  return { round_raw: str, phase: str, round_number: null };  // coupe / phase sans numéro
}

async function clubMap(db, source) {
  const { data, error } = await db.from("clubs").select("id,external_id").eq("source", source);
  if (error) throw error;
  return Object.fromEntries((data || []).map((c) => [c.external_id, c.id]));
}

// Réparation référentielle (sans appel API) : re-relie les matchs d'une saison dont le
// club est resté null (ex. créés par le live avant que le club existe) mais dont l'ID
// d'équipe stocké dans ext est désormais résolvable. Auto-limité : 0 ligne une fois sain.
async function relinkNullClubMatches(db, competition, seasonId, map) {
  const { data: broken, error } = await db.from("matches")
    .select("id,home_club_id,away_club_id,ext")
    .eq("competition_id", competition.id).eq("season_id", seasonId)
    .or("home_club_id.is.null,away_club_id.is.null");
  if (error) throw error;
  let fixed = 0;
  for (const m of broken || []) {
    const patch = {};
    const homeId = map[m.ext?.home_ext];
    const awayId = map[m.ext?.away_ext];
    if (!m.home_club_id && homeId) patch.home_club_id = homeId;
    if (!m.away_club_id && awayId) patch.away_club_id = awayId;
    if (Object.keys(patch).length) {
      const { error: updateError } = await db.from("matches").update(patch).eq("id", m.id);
      if (updateError) throw updateError;
      fixed++;
    }
  }
  return fixed;
}
function resolveMatches(matches, competitionId, seasonId, map) {
  return matches.map((m) => {
    const pr = parseRound(m.round);
    const homeId = map[m.home_ext];
    const awayId = map[m.away_ext];
    // club_id « collant » : on ne l'inclut QUE s'il est résolu. Omis = laissé tel quel à
    // l'upsert (jamais écrasé par null), ce qui empêche une resync d'effacer un club déjà
    // relié — cause des « — » qui revenaient après chaque synchronisation.
    return {
      external_id: m.external_id, competition_id: competitionId, season_id: seasonId,
      ...(homeId ? { home_club_id: homeId } : {}), ...(awayId ? { away_club_id: awayId } : {}),
      home_score: m.home_score, away_score: m.away_score, status: m.status, minute: m.minute ?? null,
      kickoff: m.kickoff, matchday: pr.round_number, round_raw: pr.round_raw, phase: pr.phase, round_number: pr.round_number, ext: m,
    };
  });
}

function normalizeStandings(groups, map) {
  return (groups || []).map((rows, index) => {
    const label = rows?.[0]?.group || `Groupe ${index + 1}`;
    const division = String(label).match(/(?:league|ligue)\s+([A-D])\b/i)?.[1]?.toUpperCase() || null;
    return {
      label,
      division,
      rows: (rows || []).map((row) => ({
        club: map[String(row.team?.id)] || null,
        rank: row.rank ?? null,
        played: row.all?.played || 0,
        won: row.all?.win || 0,
        drawn: row.all?.draw || 0,
        lost: row.all?.lose || 0,
        gf: row.all?.goals?.for || 0,
        ga: row.all?.goals?.against || 0,
        gd: row.goalsDiff || 0,
        pts: row.points || 0,
        form: row.form || null,
        status: row.status || null,
        description: row.description || null,
      })).filter((row) => row.club),
    };
  }).filter((group) => group.rows.length);
}

async function fillMissingClubProfile(db, source, rows) {
  const fields = ["founded_year", "stadium_name", "stadium_capacity", "stadium_address", "stadium_image_url"];
  const externalIds = [...new Set((rows || []).map((row) => row.external_id).filter(Boolean).map(String))];
  if (!externalIds.length) return;
  const { data: currentRows, error: selectError } = await db.from("clubs").select(`id,locked,external_id,${fields.join(",")}`).eq("source", source).in("external_id", externalIds);
  if (selectError) throw selectError;
  const currentByExternalId = new Map((currentRows || []).map((row) => [String(row.external_id), row]));
  const updates = [];
  for (const row of rows || []) {
    const current = currentByExternalId.get(String(row.external_id));
    if (!current || current.locked) continue;
    const patch = {};
    for (const field of fields) if ((current[field] === null || current[field] === "") && row[field] !== null && row[field] !== undefined && row[field] !== "") patch[field] = row[field];
    if (Object.keys(patch).length) updates.push({ id: current.id, patch });
  }
  const queue = [...updates];
  await Promise.all(Array.from({ length: Math.min(8, queue.length) }, async () => {
    while (queue.length) {
      const update = queue.shift();
      const { error } = await db.from("clubs").update(update.patch).eq("id", update.id);
      if (error) throw error;
    }
  }));
}

const RESERVE_LINKS = [
  { children: ["club nxt"], parents: ["club brugge kv", "club brugge"], type: "u23" },
  { children: ["jong genk"], parents: ["genk", "krc genk"], type: "u23" },
  { children: ["rsca futures"], parents: ["anderlecht", "rsc anderlecht"], type: "u23" },
  { children: ["jong kaa gent", "kaa gent u23"], parents: ["gent", "kaa gent"], type: "u23" },
];
const normalizeClubName = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

async function linkKnownReserveTeams(db) {
  const { data: rows, error: selectError } = await db.from("clubs").select("id,name,locked,parent_club_id,team_type");
  if (selectError) throw selectError;
  const clubs = rows || [];
  for (const rule of RESERVE_LINKS) {
    const child = clubs.find((club) => rule.children.includes(normalizeClubName(club.name)));
    const parent = clubs.find((club) => rule.parents.includes(normalizeClubName(club.name)));
    if (!child || !parent || child.locked || child.id === parent.id) continue;
    const patch = {};
    if (!child.parent_club_id) patch.parent_club_id = parent.id;
    if (!child.team_type || child.team_type === "first_team") patch.team_type = rule.type;
    if (Object.keys(patch).length) {
      const { error } = await db.from("clubs").update(patch).eq("id", child.id);
      if (error) throw error;
    }
  }
}

export async function syncCompetition(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider) return `${competition.name}: aucun provider`;
  const mode = ctx.mode || "full";
  const selectedSeason = seasonLabel(ctx.season || competition.ext?.season);
  const season = await ensureSeason(db, competition.id, selectedSeason);
  if (mode === "full" && Number(seasonYear(selectedSeason)) >= 2026) {
    const { error: rolloutError } = await db.from("seasons")
      .update({ import_status: "importing" })
      .eq("id", season.id)
      .eq("public_active", false);
    if (rolloutError) throw rolloutError;
  }
  const technicalExt = { ...(competition.ext || {}), season: seasonYear(selectedSeason), season_label: selectedSeason };
  const { error: seasonUpdateError } = await db.from("competitions").update({ ext: technicalExt }).eq("id", competition.id);
  if (seasonUpdateError) throw seasonUpdateError;

  // ── Mode LIVE : seulement les matchs en direct (économie de quota) ──────────
  if (mode === "live") {
    const fetchLive = provider.fetchLiveMatches || provider.fetchMatches;
    if (!fetchLive) return `${competition.name}: pas de live`;
    const live = await fetchLive.call(provider, competition, ctx);
    // Un match live peut référencer une équipe pas encore importée (sync complète pas
    // faite) : sans création, home/away_club_id reste null et le nom s'affiche « — ».
    // On crée UNIQUEMENT les clubs manquants, sans écraser le nom/logo des existants.
    const existingMap = await clubMap(db, competition.provider);
    const missingClubs = [];
    const seenMissing = new Set();
    for (const m of live) {
      for (const [ext, name] of [[m.home_ext, m.home_name], [m.away_ext, m.away_name]]) {
        if (ext && !existingMap[ext] && !seenMissing.has(ext)) { seenMissing.add(ext); missingClubs.push({ external_id: ext, name: name || ext }); }
      }
    }
    if (missingClubs.length) await upsertExternal(db, "clubs", competition.provider, missingClubs, ["name"]);
    const map = missingClubs.length ? await clubMap(db, competition.provider) : existingMap;
    const resolved = resolveMatches(live, competition.id, season.id, map);
    const n = await upsertExternal(db, "matches", competition.provider, resolved,
      ["competition_id", "season_id", "home_club_id", "away_club_id", "home_score", "away_score", "status", "minute", "kickoff", "matchday", "round_raw", "phase", "round_number"]);
    // Re-relie au passage les matchs passés restés sans club (le live ne refetch que le jour).
    await relinkNullClubMatches(db, competition, season.id, map);
    const liveCount = resolved.filter((match) => match.status === "live").length;

    // Finalisation : un match peut rester "live" en base si le cron a manqué le coup
    // de sifflet (il disparaît ensuite du flux du jour). On re-récupère l'état FINAL
    // réel des matchs restés "live" depuis > 3 h et on les clôture proprement.
    // Auto-limité : zéro appel API tant qu'aucun match n'est bloqué.
    let finalized = 0;
    if (provider.fetchMatchesByExternalIds) {
      const cutoff = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      const { data: stuck } = await db.from("matches").select("id,external_id")
        .eq("competition_id", competition.id).eq("status", "live")
        .not("external_id", "is", null).lt("kickoff", cutoff)
        .order("kickoff", { ascending: true }).limit(20);
      if (stuck?.length) {
        const fresh = await provider.fetchMatchesByExternalIds(stuck.map((s) => s.external_id), ctx);
        const byExt = new Map(fresh.map((f) => [String(f.external_id), f]));
        for (const s of stuck) {
          const f = byExt.get(String(s.external_id));
          if (!f || f.status === "live") continue; // toujours en cours selon le provider → on laisse
          await db.from("matches").update({ status: f.status, home_score: f.home_score, away_score: f.away_score, minute: f.minute ?? null }).eq("id", s.id);
          finalized++;
        }
      }
    }

    return `${competition.name}: ${n} match(s) du jour traité(s), ${liveCount} en direct${finalized ? ` · ${finalized} finalisé(s)` : ""}`;
  }

  // ── Mode FULL : clubs (dérivés + enrichis) + tous les matchs + coverage ─────
  const matches = provider.fetchMatches ? await provider.fetchMatches(competition, ctx) : [];
  const warnings = [];
  const derived = new Map();
  for (const m of matches) {
    if (m.home_ext) derived.set(m.home_ext, { external_id: m.home_ext, name: m.home_name || m.home_ext });
    if (m.away_ext) derived.set(m.away_ext, { external_id: m.away_ext, name: m.away_name || m.away_ext });
  }
  const seasonClubExternalIds = new Set(derived.keys());
  let clubsN = await upsertExternal(db, "clubs", competition.provider, [...derived.values()], ["name"]);
  if (provider.fetchClubs) {
    let clubs = null;
    try { clubs = await provider.fetchClubs(competition, ctx); }
    catch (error) { warnings.push(`clubs: ${error.message}`); }
    if (clubs) {
      for (const club of clubs) if (club.external_id) seasonClubExternalIds.add(String(club.external_id));
      await upsertExternal(db, "clubs", competition.provider, clubs, ["name", "short_name", "logo_url", "city"]);
      await fillMissingClubProfile(db, competition.provider, clubs);
      clubsN = Math.max(clubsN, clubs.length);
    }
  }
  await linkKnownReserveTeams(db);
  const map = await clubMap(db, competition.provider);
  const matchN = await upsertExternal(db, "matches", competition.provider, resolveMatches(matches, competition.id, season.id, map),
    ["competition_id", "season_id", "home_club_id", "away_club_id", "home_score", "away_score", "status", "minute", "kickoff", "matchday", "round_raw", "phase", "round_number"]);
  // Filet de sécurité : re-relie les matchs de la saison restés sans club mais désormais
  // résolvables (créés par un live antérieur, ou hors fenêtre de fetchMatches).
  await relinkNullClubMatches(db, competition, season.id, map);

  let leagueName = competition.name;
  let finalExt = {
    ...technicalExt,
    club_external_ids_by_season: {
      ...(technicalExt.club_external_ids_by_season || {}),
      [selectedSeason]: [...seasonClubExternalIds],
    },
  };
  if (provider.fetchLeagueInfo) {
    let info = null;
    try { info = await provider.fetchLeagueInfo(competition, ctx); }
    catch (error) { warnings.push(`infos ligue: ${error.message}`); }
    if (info) {
      leagueName = info.name || leagueName;
      finalExt = { ...finalExt, coverage: info.coverage, providerName: info.name, providerType: info.type, country: info.country, country_flag: info.flag };
      const patch = { ext: finalExt };
      if (!competition.locked && info.logo && !competition.logo_url) patch.logo_url = info.logo;   // logo auto SEULEMENT si vide -> le logo manuel est prioritaire
      const { error } = await db.from("competitions").update(patch).eq("id", competition.id);
      if (error) throw error;
    }
  }
  if (provider.fetchStandings) {
    try {
      const groups = normalizeStandings(await provider.fetchStandings(competition, ctx), map);
      if (groups.length) finalExt = { ...finalExt, standings_by_season: { ...(finalExt.standings_by_season || {}), [selectedSeason]: groups } };
    } catch (error) { warnings.push(`classements: ${error.message}`); }
  }
  // Ces marqueurs ne sont posés qu'après la fin du job de base. La carte par
  // saison évite qu'un import complet 2024 fasse passer une saison 2026 encore
  // partielle pour complète. Les imports ciblés des sélections ne les posent pas.
  const completedAt = new Date().toISOString();
  const completedSeasons = { ...(finalExt.full_competition_seasons || {}), [selectedSeason]: completedAt };
  const { error: completionError } = await db.from("competitions").update({ ext: { ...finalExt, full_competition_synced_at: completedAt, full_competition_seasons: completedSeasons } }).eq("id", competition.id);
  if (completionError) throw completionError;
  return `${leagueName}: ${clubsN} clubs, ${matchN} matchs${warnings.length ? ` · avertissements: ${warnings.join("; ")}` : ""}`;
}
