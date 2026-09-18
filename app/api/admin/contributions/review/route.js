import { getCollection } from "@/config/collections";
import { getAdmin } from "@/lib/supabaseAdmin";
import { sanitizeRichHtml } from "@/lib/sanitizeRichHtml";
import { slugify } from "@/lib/slugify";

export const dynamic = "force-dynamic";

const COLUMN = {
  title: "title", slug: "slug", excerpt: "excerpt", body: "body",
  cover: "cover_url", images: "images", category: "category",
  published_at: "published_at", seo: "seo",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAdmin(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: new Response("Unauthorized", { status: 401 }) };
  const admin = getAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: new Response("Unauthorized", { status: 401 }) };
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { error: new Response("Forbidden", { status: 403 }) };
  return { admin, user };
}

function validHttpUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}

function cleanString(value, max, label) {
  if (typeof value !== "string") throw new Error(`${label} doit être un texte.`);
  if (value.length > max) throw new Error(`${label} dépasse ${max} caractères.`);
  return value;
}

function cleanField(key, field, value) {
  if (field.type === "richtext") return sanitizeRichHtml(cleanString(value, 50000, key));
  if (["text", "textarea", "slug", "category", "date", "select"].includes(field.type)) {
    return cleanString(value, field.type === "textarea" ? 10000 : 500, key);
  }
  if (field.type === "link") {
    const link = cleanString(value, 2000, key);
    if (link && !validHttpUrl(link)) throw new Error(`${key} doit être une URL http(s).`);
    return link;
  }
  if (field.type === "image") {
    const image = cleanString(value, 2000, key);
    if (image && !validHttpUrl(image)) throw new Error(`${key} doit être une image http(s).`);
    return image;
  }
  if (field.type === "gallery") {
    if (!Array.isArray(value) || value.length > 20 || value.some((url) => typeof url !== "string" || !validHttpUrl(url))) {
      throw new Error(`${key} contient une galerie invalide.`);
    }
    return value;
  }
  if (field.type === "seo") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} est invalide.`);
    return {
      title: cleanString(value.title || "", 200, `${key}.title`),
      description: cleanString(value.description || "", 500, `${key}.description`),
    };
  }
  if (field.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${key} doit être un nombre.`);
    return number;
  }
  if (field.type === "bool") return Boolean(value);
  throw new Error(`Type de champ non autorisé pour ${key}.`);
}

function contributionToEntry(contribution, collection, existing) {
  const payload = contribution.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Payload invalide.");
  if (JSON.stringify(payload).length > 100000) throw new Error("Contribution trop volumineuse.");

  const base = existing
    ? { ...existing, data: { ...(existing.data || {}) } }
    : { collection: contribution.collection, published: false, images: [], data: {}, seo: {} };

  for (const [key, value] of Object.entries(payload)) {
    // Le statut de publication reste exclusivement sous le contrôle de l'admin.
    if (key === "published") continue;
    const field = collection.fields?.[key];
    if (!field) throw new Error(`Champ non autorisé : ${key}.`);
    const cleaned = cleanField(key, field, value);
    if (COLUMN[key]) base[COLUMN[key]] = cleaned;
    else base.data[key] = cleaned;
  }

  if (!base.slug && base.title) base.slug = slugify(base.title);
  base.collection = contribution.collection;
  base.updated_at = new Date().toISOString();
  return base;
}

export async function POST(req) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { id, action } = body;
  const note = typeof body.note === "string" ? body.note.slice(0, 2000) : "";
  if (!UUID.test(id || "") || !["approve", "reject"].includes(action)) {
    return new Response("Invalid review request", { status: 400 });
  }

  const { admin, user } = auth;
  const { data: contribution, error: readError } = await admin.from("contributions")
    .select("*").eq("id", id).eq("status", "pending").maybeSingle();
  if (readError) return new Response(readError.message, { status: 500 });
  if (!contribution) return new Response("Contribution not found or already reviewed", { status: 404 });

  try {
    let entryId = contribution.target_id || null;
    if (action === "approve") {
      const collection = getCollection(contribution.collection);
      if (!collection) throw new Error("Collection inconnue ou désactivée.");
      if (!["create", "edit"].includes(contribution.kind)) throw new Error("Type de contribution invalide.");

      let existing = null;
      if (contribution.kind === "edit") {
        if (!UUID.test(contribution.target_id || "")) throw new Error("Cible de correction invalide.");
        const { data, error } = await admin.from("entries").select("*")
          .eq("id", contribution.target_id).eq("collection", contribution.collection).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Contenu cible introuvable.");
        existing = data;
      } else if (contribution.target_id) {
        throw new Error("Une nouvelle contribution ne peut pas cibler une entrée existante.");
      }

      const row = contributionToEntry(contribution, collection, existing);
      const { data: saved, error: saveError } = await admin.from("entries").upsert(row).select("id").single();
      if (saveError) throw saveError;
      entryId = saved.id;
    }

    const reviewedAt = new Date().toISOString();
    const { error: updateError } = await admin.from("contributions").update({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
      note,
    }).eq("id", contribution.id).eq("status", "pending");
    if (updateError) throw updateError;

    await admin.from("audit_log").insert({
      actor: user.id,
      action: `contribution.${action}`,
      target_table: "contributions",
      target_id: contribution.id,
      meta: { collection: contribution.collection, entry_id: entryId },
    });
    return Response.json({ ok: true, entryId, published: contribution.kind === "edit" && action === "approve" ? undefined : false });
  } catch (error) {
    return new Response(error.message || "Review failed", { status: 400 });
  }
}
