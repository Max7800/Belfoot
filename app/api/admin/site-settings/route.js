import { getAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const TILE_KEYS = ["topscorer", "topassist", "cleansheet", "note", "upcoming"];
const TILE_SCOPES = ["national", "europe", "international"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

async function requireAdmin(request, db) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { response: new Response("Unauthorized", { status: 401 }) };
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { response: new Response("Unauthorized", { status: 401 }) };
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { response: new Response("Forbidden", { status: 403 }) };
  return { user };
}

function cleanUrl(value) {
  if (value === "" || value == null) return "";
  if (typeof value !== "string" || value.length > 2000) throw new Error("URL de fond invalide.");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL de fond invalide.");
  return value;
}

function cleanTile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const tile = {};
  if (typeof value.enabled === "boolean") tile.enabled = value.enabled;
  if (value.background_url !== undefined) tile.background_url = cleanUrl(value.background_url);
  if (value.overlay !== undefined) {
    const overlay = Number(value.overlay);
    if (!Number.isFinite(overlay) || overlay < 0 || overlay > 1) throw new Error("Overlay invalide.");
    tile.overlay = overlay;
  }
  if (value.accent !== undefined) {
    if (!HEX_COLOR.test(value.accent)) throw new Error("Couleur d’accent invalide.");
    tile.accent = value.accent;
  }
  if (value.border_color !== undefined) {
    if (!HEX_COLOR.test(value.border_color)) throw new Error("Couleur de contour invalide.");
    tile.border_color = value.border_color;
  }
  return tile;
}

export async function POST(request) {
  try {
    const db = getAdmin();
    const auth = await requireAdmin(request, db);
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    if (!TILE_SCOPES.includes(body.scope) || !TILE_KEYS.includes(body.key)) {
      return new Response("Tuile ou univers invalide.", { status: 400 });
    }
    const patch = cleanTile(body.patch);
    if (!Object.keys(patch).length) return new Response("Modification vide ou invalide.", { status: 400 });
    const { data: current, error: readError } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
    if (readError) throw readError;
    const currentTiles = current?.data?.tiles || {};
    const tiles = {
      ...currentTiles,
      [body.scope]: {
        ...(currentTiles[body.scope] || {}),
        [body.key]: { ...(currentTiles[body.scope]?.[body.key] || {}), ...patch },
      },
    };
    const { data: saved, error: saveError } = await db.from("site_settings")
      .update({ data: { ...(current?.data || {}), tiles } })
      .eq("id", 1)
      .select("id")
      .maybeSingle();
    if (saveError) throw saveError;
    if (!saved) throw new Error("La ligne site_settings n’a pas été mise à jour.");

    await db.from("audit_log").insert({
      actor: auth.user.id,
      action: "settings.tiles.update",
      target_table: "site_settings",
      meta: { id: 1, scope: body.scope, tile: body.key, fields: Object.keys(patch) },
    });
    return Response.json({ ok: true, tiles });
  } catch (error) {
    return new Response(error.message || "Impossible d’enregistrer les tuiles.", { status: 400 });
  }
}
