import Link from "next/link";
import { notFound } from "next/navigation";
import { collectionByRoute } from "@/config/collections";
import { listEntries } from "@/lib/entries";
import { categoryColorMap } from "@/lib/categories";
import { buildMetadata } from "@/lib/seo";
import CategoryBadge from "@/components/CategoryBadge";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const c = collectionByRoute("/" + params.collection);
  return buildMetadata({ title: c?.label || "Contenu", path: c?.route });
}

export default async function CollectionList({ params }) {
  const c = collectionByRoute("/" + params.collection);
  if (!c) notFound();
  let items = [], colors = {};
  try { items = await listEntries(c.key, { publishedOnly: true }); } catch {}
  try { colors = await categoryColorMap(c.key); } catch {}
  return (
    <div>
      <h1 className="mb-6 text-3xl font-black">{c.label}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((e) => (
          <Link key={e.id} href={`${c.route}/${e.slug}`} className="overflow-hidden rounded-xl border border-line/10 bg-surface transition hover:border-accent/40">
            {e.cover_url && <img src={e.cover_url} alt="" className="aspect-[16/10] w-full object-cover" />}
            <div className="p-4">
              <CategoryBadge name={e.category} color={colors[e.category]} />
              <div className="mt-1 font-bold">{e.title}</div>
              {e.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted">{e.excerpt}</p>}
            </div>
          </Link>
        ))}
        {items.length === 0 && <p className="text-muted">Aucun contenu publié pour l'instant.</p>}
      </div>
    </div>
  );
}
