"use client";
import Link from "next/link";
import { adminPanels } from "@/lib/modules";
import { useAuth } from "@/lib/auth";

export default function AdminLayout({ children }) {
  const { isAdmin, loading, session } = useAuth();
  return (
    <div data-force-dark className="min-h-screen bg-bg text-content">
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <aside className="w-52 shrink-0">
          <div className="mb-4 text-xs font-bold uppercase tracking-wider text-muted">Administration</div>
          <nav className="space-y-1">
            {adminPanels().map((p) => (
              <Link key={p.key} href={`/admin/${p.key}`} className="block rounded px-2 py-1.5 text-sm text-muted hover:bg-surface hover:text-content">{p.label}</Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          {loading ? <p className="text-muted">…</p>
            : !session ? <p className="text-muted">Connexion requise.</p>
            : !isAdmin ? <p className="text-muted">Accès réservé aux administrateurs.</p>
            : children}
        </div>
      </div>
    </div>
  );
}
