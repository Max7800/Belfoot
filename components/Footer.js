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
    </footer>
  );
}
