import { getProvider } from "./providers";
import { upsertPlayerMembership } from "./playerMemberships";

export async function syncSquads(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchSquadPlayers) return `${competition.name}: squad non supporté`;
  if (competition.ext?.coverage && competition.ext.coverage.players === false) return `${competition.name}: joueurs non couverts`;

  const season = (String(ctx.season ?? competition.ext?.season ?? "").match(/\d{4}/) || [])[0] || String(new Date().getFullYear());
  const [{ data: ms, error: matchesError }, { data: seasonRows, error: seasonsError }] = await Promise.all([
    db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id),
    db.from("seasons").select("id,label").eq("competition_id", competition.id),
  ]);
  if (matchesError) throw matchesError;
  if (seasonsError) throw seasonsError;
  const seasonRow = (seasonRows || []).find((row) => String(row.label || "").includes(season));
  const clubIds = [...new Set((ms || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
  if (!clubIds.length) return `${competition.name}: aucun club (fais d'abord l'import)`;
  const { data: clubs, error: clubsError } = await db.from("clubs").select("id,name,external_id,team_type,parent_club_id").in("id", clubIds);
  if (clubsError) throw clubsError;

  const now = new Date().toISOString();
  let n = 0;
  for (const club of clubs || []) {
    const players = await provider.fetchSquadPlayers({ external_id: club.external_id }, { ...ctx, season, leagueId: competition.external_id });
    for (const p of players) {
      const { data: existing, error: existingError } = await db.from("players").select("id,locked,club_id").eq("source", competition.provider).eq("external_id", p.external_id).maybeSingle();
      if (existingError) throw existingError;
      const primaryClub = !["reserve", "u23", "youth", "women"].includes(club.team_type);
      const patch = { source: competition.provider, external_id: p.external_id, name: p.name, nationality: p.nationality, position: p.position, photo_url: p.photo_url, age: p.age, birth_date: p.birth_date, club_id: primaryClub || !existing?.club_id ? club.id : existing.club_id, country: competition.ext?.country || null, competition: competition.name, synced_at: now };
      let pid = existing?.id;
      if (existing && !existing.locked) {
        const { error } = await db.from("players").update(patch).eq("id", existing.id);
        if (error) throw error;
      } else if (!existing) {
        const { data: ins, error } = await db.from("players").insert({ ...patch, active: true, tracked: false }).select("id").single();
        if (error) throw error;
        pid = ins?.id;
      }
      if (pid && p.stats) {
        const { error } = await db.from("player_season_stats").upsert({ player_id: pid, club_id: club.id, season_id: seasonRow?.id || null, competition_id: competition.id, season, ...p.stats, source: competition.provider, external_id: p.external_id, synced_at: now }, { onConflict: "player_id,club_id,competition_id,season" });
        if (error) throw new Error(`${competition.name}: stats ${p.name}: ${error.message}`);
      }
      if (pid) await upsertPlayerMembership(db, {
        playerId: pid,
        club,
        season,
        source: competition.provider,
        externalId: p.external_id,
        position: p.position,
        shirtNumber: p.number ?? null,
        isPrimary: primaryClub,
        ext: p.ext || {},
        syncedAt: now,
      });
      n++;
    }
  }
  return `${competition.name}: ${n} joueurs (+ stats saison)`;
}
