import { notFound } from "next/navigation";
import { collectionByRoute } from "@/config/collections";
import { getEntry } from "@/lib/entries";
import CategoryBadge from "@/components/CategoryBadge";
import RichContent from "@/components/RichContent";
import { categoryColorMap } from "@/lib/categories";
import { buildMetadata } from "@/lib/seo";
import DiscussButton from "@/components/forum/DiscussButton";
import { StatusBadge } from "@/lib/statuses";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { collection, slug } = await params;
  const c = collectionByRoute("/" + collection);
  if (!c) return {};
  let e = null;
  try { e = await getEntry(c.key, slug); } catch {}
  return buildMetadata({ title: e?.seo?.title || e?.title || c.label, description: e?.seo?.description || e?.excerpt, image: e?.cover_url, path: `${c.route}/${slug}` });
}

export default async function EntryDetail({ params }) {
  const { collection, slug } = await params;
  const c = collectionByRoute("/" + collection);
  if (!c) notFound();
  let e = null;
  try { e = await getEntry(c.key, slug); } catch {}
  if (!e || !e.published) notFound();
  let colors = {}; try { colors = await categoryColorMap(c.key); } catch {}
  const imgs = Array.isArray(e.images) ? e.images : [];
  return (
    <article className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center gap-2"><CategoryBadge name={e.category} color={colors[e.category]} /><StatusBadge status={e.data?.status} /></div>
      <h1 className="mt-2 text-3xl font-black">{e.title}</h1>
      {e.cover_url && <img src={e.cover_url} alt="" className="mt-4 w-full rounded-xl" />}
      {e.body && <div className="mt-6"><RichContent html={e.body} /></div>}
      {imgs.length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {imgs.map((u, i) => <img key={i} src={u} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />)}
        </div>
      )}
      <div className="mt-8 border-t border-line/10 pt-6"><DiscussButton refType="article" refId={e.id} title={`Discussion : ${e.title}`} label="Discuter de cet article" /></div>
    </article>
  );
}
