import { getAdmin } from "@/lib/supabaseAdmin";
import { auditSeasonReadiness } from "@/lib/seasonReadiness";

export const dynamic = "force-dynamic";

async function requireAdmin(request, db) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { response: new Response("Unauthorized", { status: 401 }) };
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { response: new Response("Unauthorized", { status: 401 }) };
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { response: new Response("Forbidden", { status: 403 }) };
  return { user };
}

export async function POST(request) {
  try {
    const db = getAdmin();
    const auth = await requireAdmin(request, db);
    if (auth.response) return auth.response;
    const input = await request.json().catch(() => ({}));
    const seasonIds = [...new Set([...(Array.isArray(input.seasonIds) ? input.seasonIds : []), ...(input.seasonId ? [input.seasonId] : [])].filter(Boolean))].slice(0, 50);
    if (!seasonIds.length) return new Response("Aucune saison fournie", { status: 400 });
    const reports = [];
    for (const seasonId of seasonIds) reports.push(await auditSeasonReadiness(db, seasonId));

    if (input.action === "mark-ready") {
      if (seasonIds.length !== 1) return new Response("Une seule saison peut être validée à la fois", { status: 400 });
      const report = reports[0];
      if (!report.ok) return Response.json({ ok: false, report, error: "La saison ne satisfait pas encore tous les contrôles obligatoires." }, { status: 409 });
      if (report.season.public_active) return Response.json({ ok: true, report });
      const { error } = await db.from("seasons").update({ import_status: "ready" }).eq("id", report.season.id).eq("public_active", false);
      if (error) throw error;
      return Response.json({ ok: true, report: await auditSeasonReadiness(db, report.season.id) });
    }

    return Response.json({ ok: true, reports });
  } catch (error) {
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}
