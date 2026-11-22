// Aperçu isolé : données de démonstration en mémoire, sans accès à la production.
import { createFakeSupabase } from "@/tests/helpers/fakeSupabase";
const now = Date.now();
const comps = [
  ["demo-pro", "Jupiler Pro League", "144"],
  ["demo-d2", "Challenger Pro League", "145"],
  ["demo-c1", "Ligue des champions", "2"],
  ["demo-c3", "Europa League", "3"],
  ["demo-c4", "Ligue Conférence", "848"],
].map(([id, name, external_id], position) => ({ id, name, slug: id, external_id, provider: "apifootball", public_visible: true, position, ext: { season: "2026-2027" } }));
const clubs = ["Bruges", "Anderlecht", "Union", "Standard", "Genk", "Gand"].map((name, index) => ({ id: `demo-club-${index}`, name, team_type: "club" }));
const matches = comps.flatMap((competition, index) => [
  { id: `demo-match-${index}`, competition_id: competition.id, season_id: `demo-season-${index}`, kickoff: new Date(now + (index + 1) * 86400000).toISOString(), status: "scheduled", home_club_id: clubs[index % clubs.length].id, away_club_id: clubs[(index + 1) % clubs.length].id },
  { id: `demo-result-${index}`, competition_id: competition.id, season_id: `demo-season-${index}`, kickoff: new Date(now - (index + 1) * 86400000).toISOString(), status: "finished", home_club_id: clubs[index % clubs.length].id, away_club_id: clubs[(index + 1) % clubs.length].id, home_score: 2, away_score: 1 },
]);
export const supabase = createFakeSupabase({ competitions: comps, clubs, matches, seasons: comps.map((competition, index) => ({ id: `demo-season-${index}`, competition_id: competition.id, label: "2026-2027", public_active: true })), site_settings: [{ id: 1, data: {} }] });
const channel = { on: () => channel, subscribe: () => channel };
supabase.channel = () => channel;
supabase.removeChannel = () => {};
supabase.auth = { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) };
