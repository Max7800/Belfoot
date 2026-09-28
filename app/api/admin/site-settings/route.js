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

function cleanTiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configuration des tuiles invalide.");
  if (JSON.stringify(value).length > 100000) throw new Error("Configuration des tuiles trop volumineuse.");
  const tiles = {};
  for (const key of TILE_KEYS) if (value[key]) tiles[key] = cleanTile(value[key]);
  for (const scope of TILE_SCOPES) {
    if (!value[scope]) continue;
    tiles[scope] = {};
    for (const key of TILE_KEYS) if (value[scope][key]) tiles[scope][key] = cleanTile(value[scope][key]);
  }
  return tiles;
}

export async function POST(request) {
  try {
    const db = getAdmin();
    const auth = await requireAdmin(request, db);
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const tiles = cleanTiles(body.tiles);
    const { data: current, error: readError } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
    if (readError) throw readError;
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
      meta: { id: 1, scopes: TILE_SCOPES.filter((scope) => tiles[scope]) },
    });
    return Response.json({ ok: true, tiles });
  } catch (error) {
    return new Response(error.message || "Impossible d’enregistrer les tuiles.", { status: 400 });
  }
}
