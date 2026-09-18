"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, ChevronDown, FileText, Home, Menu, Palette, RefreshCw,
  Search, Settings, Shield, Trophy, Users, UsersRound, X,
} from "lucide-react";
import { adminPanelIndex, adminSections } from "@/config/admin";
import { useAuth } from "@/lib/auth";

const ICONS = {
  activity: Activity, community: UsersRound, editorial: FileText, home: Home,
  palette: Palette, refresh: RefreshCw, settings: Settings, trophy: Trophy, users: Users,
};

function AdminNavigation({ onNavigate }) {
  const pathname = usePathname();
  const activeKey = pathname.split("/").filter(Boolean)[1] || "dashboard";
  const [query, setQuery] = useState("");
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(adminSections.map((section) => [section.label, !section.collapsed])),
  );

  useEffect(() => {
    const activeSection = adminPanelIndex[activeKey]?.section;
    if (activeSection) setOpenSections((current) => ({ ...current, [activeSection]: true }));
  }, [activeKey]);

  const sections = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    if (!normalized) return adminSections;
    return adminSections.map((section) => ({
      ...section,
      panels: section.panels.filter((panel) => `${panel.label} ${section.label}`.toLocaleLowerCase("fr").includes(normalized)),
    })).filter((section) => section.panels.length);
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line/10 px-4 pb-4 pt-5">
        <Link href="/admin/dashboard" onClick={onNavigate} className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white"><Shield size={18} /></span>
          <span><b className="block leading-none">Belfoot</b><span className="text-[10px] uppercase tracking-[0.18em] text-muted">Administration</span></span>
        </Link>
        <label className="mt-4 flex items-center gap-2 rounded-lg border border-line/10 bg-bg/50 px-3 py-2 text-muted focus-within:border-accent/50">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Trouver un réglage…" className="min-w-0 flex-1 bg-transparent text-xs text-content outline-none" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Effacer"><X size={13} /></button>}
        </label>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {sections.map((section) => {
          const Icon = ICONS[section.icon] || Settings;
          const containsActive = section.panels.some((panel) => panel.key === activeKey);
          const isOpen = Boolean(query || openSections[section.label] || containsActive);
          return (
            <div key={section.label} className="mb-1">
              <button type="button" onClick={() => setOpenSections((current) => ({ ...current, [section.label]: !current[section.label] }))} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition ${containsActive ? "text-content" : "text-muted hover:bg-surface hover:text-content"}`}>
                <Icon size={15} className={containsActive ? "text-accent" : ""} />
                <span className="flex-1">{section.label}</span>
                <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && <div className="ml-4 border-l border-line/10 py-1 pl-2">
                {section.panels.map((panel) => {
                  const active = panel.key === activeKey;
                  return <Link key={panel.key} href={`/admin/${panel.key}`} onClick={onNavigate} className={`relative block rounded-md px-2.5 py-1.5 text-xs transition ${active ? "bg-accent/10 font-semibold text-content before:absolute before:-left-[9px] before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded before:bg-accent" : "text-muted hover:bg-surface hover:text-content"} ${panel.secondary ? "pl-4 text-[11px]" : ""}`}>{panel.label}</Link>;
                })}
              </div>}
            </div>
          );
        })}
        {sections.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">Aucun outil trouvé.</p>}
      </nav>
    </div>
  );
}

export default function AdminLayout({ children }) {
  const { isAdmin, loading, session } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeKey = pathname.split("/").filter(Boolean)[1] || "dashboard";
  const current = adminPanelIndex[activeKey];

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <div data-force-dark className="min-h-screen bg-bg text-content">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line/10 bg-bg/95 px-4 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu" className="grid h-9 w-9 place-items-center rounded-lg border border-line/10 bg-surface"><Menu size={18} /></button>
        <div className="min-w-0"><div className="text-[10px] uppercase tracking-wider text-muted">{current?.section || "Administration"}</div><div className="truncate text-sm font-bold">{current?.label || "Belfoot"}</div></div>
      </header>
      {mobileOpen && <button type="button" aria-label="Fermer le menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/65 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[min(86vw,280px)] border-r border-line/10 bg-surface2 shadow-2xl transition-transform lg:w-64 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fermer" className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface lg:hidden"><X size={17} /></button>
        <AdminNavigation onNavigate={() => setMobileOpen(false)} />
      </aside>
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-5 hidden items-center gap-2 text-xs text-muted lg:flex"><span>Administration</span><span>/</span><span>{current?.section || "—"}</span><span>/</span><span className="text-content">{current?.label || activeKey}</span></div>
          {loading ? <p className="text-muted">Chargement…</p>
            : !session ? <p className="rounded-xl border border-line/10 bg-surface p-5 text-muted">Connexion requise.</p>
            : !isAdmin ? <p className="rounded-xl border border-line/10 bg-surface p-5 text-muted">Accès réservé aux administrateurs.</p>
            : children}
        </div>
      </main>
    </div>
  );
}
