import Link from "next/link";
import siteConfig from "@/config/site";
export default function Footer() {
  const links = Object.entries(siteConfig.socials || {}).filter(([, v]) => v);
  return (
    <footer className="border-t border-line/10 py-8 text-center text-sm text-muted">
      <div>© {new Date().getFullYear()} {siteConfig.name}</div>
      {links.length > 0 && (
        <div className="mt-2 flex justify-center gap-4">
          {links.map(([k, v]) => <a key={k} href={v} className="capitalize hover:text-content">{k}</a>)}
        </div>
      )}
      <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs">
        <Link href="/cgu" className="hover:text-content">Conditions d&apos;utilisation</Link>
        <Link href="/confidentialite" className="hover:text-content">Confidentialité</Link>
        <Link href="/mentions-legales" className="hover:text-content">Mentions légales</Link>
      </div>
    </footer>
  );
}
