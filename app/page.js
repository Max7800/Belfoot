import Link from "next/link";
import siteConfig from "@/config/site";
import { publicCollections } from "@/config/collections";
import { enabledModules } from "@/lib/modules";

export default function Home() {
  const cols = publicCollections();
  const modCards = enabledModules().flatMap((m) => (m.nav || []).map((n) => ({ ...n, from: m.label })));
  return (
    <div>
      <section className="py-12">
        <h1 className="text-4xl font-black">{siteConfig.name}</h1>
        <p className="mt-3 max-w-xl text-muted">{siteConfig.description}</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cols.map((c) => (
          <Link key={c.key} href={c.route} className="rounded-xl border border-line/10 bg-surface p-5 transition hover:border-accent/40">
            <div className="font-bold">{c.label}</div>
            <div className="text-sm text-muted">{c.route}</div>
          </Link>
        ))}
        {modCards.map((n) => (
          <Link key={n.to} href={n.to} className="rounded-xl border border-line/10 bg-surface p-5 transition hover:border-accent/40">
            <div className="font-bold">{n.label}</div>
            <div className="text-sm text-muted">{n.from}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
