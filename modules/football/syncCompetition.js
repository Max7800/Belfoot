import { getProvider } from "./providers";
import { upsertExternal } from "./sync";

// Importe une compétition depuis son provider en garantissant le mapping :
// on crée d'abord un club pour CHAQUE équipe référencée par un match (id + nom),
// puis on enrichit avec fetchClubs (logos…), puis on résout les matchs.
export async function syncCompetition(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider) return `${competition.name}: aucun provider`;

  const matches = provider.fetchMatches ? await provider.fetchMatches(competition, ctx) : [];

  // (a) clubs dérivés des matchs -> le mapping ne peut plus être vide
  const derived = new Map();
  for (const m of matches) {
    if (m.home_ext) derived.set(m.home_ext, { external_id: m.home_ext, name: m.home_name || m.home_ext });
    if (m.away_ext) derived.set(m.away_ext, { external_id: m.away_ext, name: m.away_name || m.away_ext });
  }
  let clubsN = await upsertExternal(db, "clubs", competition.provider, [...derived.values()], ["name"]);

  // (b) enrichissement (logos, ville…) — best effort
  if (provider.fetchClubs) {
    try {
      const clubs = await provider.fetchClubs(competition, ctx);
      await upsertExternal(db, "clubs", competition.provider, clubs, ["name", "short_name", "logo_url", "city"]);
    } catch { /* enrichissement optionnel */ }
  }

  // (c) mapping id externe -> id interne
  const { data: mine } = await db.from("clubs").select("id,external_id").eq("source", competition.provider);
  const map = Object.fromEntries((mine || []).map((c) => [c.external_id, c.id]));

  // (d) résolution + upsert des matchs
  const resolved = matches.map((m) => ({
    external_id: m.external_id, competition_id: competition.id,
    home_club_id: map[m.home_ext] || null, away_club_id: map[m.away_ext] || null,
    home_score: m.home_score, away_score: m.away_score, status: m.status, minute: m.minute ?? null,
    kickoff: m.kickoff, matchday: m.matchday, ext: m,
  }));
  const matchN = await upsertExternal(db, "matches", competition.provider, resolved,
    ["competition_id", "home_club_id", "away_club_id", "home_score", "away_score", "status", "minute", "kickoff", "matchday"]);

  return `${competition.name}: ${clubsN} clubs, ${matchN} matchs`;
}
