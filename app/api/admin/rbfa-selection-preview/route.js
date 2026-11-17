import { getAdmin } from "@/lib/supabaseAdmin";
import { readAll } from "@/lib/readAll";
import { compareRbfaSelection, parseRbfaSelection, RBFA_SELECTION_SOURCES } from "@/modules/football/rbfaSelections";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TEAM_IDS = { senior: "1", u21: "8183" };
const MAX_BYTES = 512000;

export async function GET(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  try {
    const db = getAdmin();
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return new Response("Unauthorized", { status: 401 });
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "admin") return new Response("Forbidden", { status: 403 });
    const category = new URL(request.url).searchParams.get("category");
    if (!Object.hasOwn(TEAM_IDS, category || "")) return new Response("Sélection non prise en charge", { status: 400 });

    const response = await fetch(RBFA_SELECTION_SOURCES[category], { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
    if (!response.ok || !response.body) throw new Error("Source RBFA indisponible");
    if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Document RBFA trop volumineux");
    const reader = response.body.getReader();
    const chunks = []; let total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) throw new Error("Document RBFA trop volumineux");
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const official = parseRbfaSelection(new TextDecoder("windows-1252").decode(bytes));
    const dates = [...new Set(official.map((person) => person.birthDate))];
    const [teamResult, playerResult] = await Promise.all([
      db.from("clubs").select("id,name").eq("source", "apifootball").eq("external_id", TEAM_IDS[category]).eq("team_type", "national").maybeSingle(),
      readAll(() => db.from("players").select("id,name,birth_date").in("birth_date", dates)),
    ]);
    if (teamResult.error || playerResult.error) throw teamResult.error || playerResult.error;
    if (!teamResult.data) return new Response("Sélection belge introuvable", { status: 404 });
    const callups = await readAll(() => db.from("national_team_callups").select("id,player_id").eq("national_team_id", teamResult.data.id).eq("active", true));
    if (callups.error) throw callups.error;
    const currentIds = [...new Set((callups.data || []).map((row) => row.player_id).filter(Boolean))];
    const compared = compareRbfaSelection(official, playerResult.data || [], currentIds);
    const currentPlayers = currentIds.length
      ? await readAll(() => db.from("players").select("id,name").in("id", currentIds))
      : { data: [], error: null };
    if (currentPlayers.error) throw currentPlayers.error;
    const currentNames = new Map((currentPlayers.data || []).map((player) => [player.id, player.name]));
    return Response.json({
      team: teamResult.data.name, category, source: RBFA_SELECTION_SOURCES[category], observedAt: new Date().toISOString(),
      lastModified: response.headers.get("last-modified") || null,
      officialCount: official.length, ...compared,
      removalCandidates: compared.removals?.map((id) => ({ playerId: id, name: currentNames.get(id) || "Joueur non trouvé" })) || null,
      note: "Comparaison indicative : date de publication de la sélection non confirmée, aucune donnée modifiée.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: String(error?.message || error).slice(0, 250) }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
