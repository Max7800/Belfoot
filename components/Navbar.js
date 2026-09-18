"use client";
import Link from "next/link";
import { Sun, Moon, Shield, Search, LogIn, LogOut, Menu, User, X } from "lucide-react";
import { useState } from "react";
import siteConfig from "@/config/site";
import { navItems } from "@/lib/modules";
import { useThemeMode } from "./ThemeModeProvider";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

export default function Navbar() {
  const { mode, setMode, allowSwitch } = useThemeMode();
  const { session, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);
  return (
    <header className="border-b border-line/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="shrink-0 text-lg font-black">{siteConfig.name}</Link>
        <nav className="hidden min-w-0 items-center gap-3 whitespace-nowrap text-xs lg:flex lg:gap-4 lg:text-sm">
          {navItems().map((i) => <Link key={i.to} href={i.to} className="text-muted hover:text-content">{i.label}</Link>)}
          {siteConfig.modules?.search && <Link href="/recherche" className="text-muted hover:text-content" title="Rechercher"><Search className="h-4 w-4" /></Link>}
          {isAdmin && <Link href="/admin" className="text-muted hover:text-content" title="Admin"><Shield className="h-4 w-4" /></Link>}
          {session
            ? <>
                <Link href="/compte" className="text-muted hover:text-content" title="Mon compte"><User className="h-4 w-4" /></Link>
                <button onClick={() => supabase.auth.signOut()} className="text-muted hover:text-content" title="Déconnexion"><LogOut className="h-4 w-4" /></button>
              </>
            : <Link href="/login" className="text-muted hover:text-content" title="Connexion"><LogIn className="h-4 w-4" /></Link>}
          {allowSwitch && <button onClick={() => setMode(mode === "dark" ? "light" : "dark")} className="text-muted hover:text-content" aria-label="Thème">{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>}
        </nav>
        <div className="flex items-center gap-2 lg:hidden">
          {siteConfig.modules?.search && <Link href="/recherche" className="rounded-lg border border-line/10 p-2 text-muted" title="Rechercher"><Search className="h-4 w-4" /></Link>}
          <button onClick={() => setMobileOpen((current) => !current)} className="rounded-lg border border-line/10 p-2 text-muted" aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}>{mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
        </div>
      </div>
      {mobileOpen && <nav className="border-t border-line/10 bg-bg/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2">
          {navItems().map((item) => <Link key={item.to} href={item.to} onClick={closeMobile} className="rounded-xl border border-line/10 bg-surface/60 px-3 py-2.5 text-sm font-semibold">{item.label}</Link>)}
          {isAdmin && <Link href="/admin" onClick={closeMobile} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/60 px-3 py-2.5 text-sm font-semibold"><Shield className="h-4 w-4" />Admin</Link>}
          {session ? <><Link href="/compte" onClick={closeMobile} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/60 px-3 py-2.5 text-sm font-semibold"><User className="h-4 w-4" />Compte</Link><button onClick={() => { closeMobile(); supabase.auth.signOut(); }} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/60 px-3 py-2.5 text-left text-sm font-semibold"><LogOut className="h-4 w-4" />Déconnexion</button></> : <Link href="/login" onClick={closeMobile} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/60 px-3 py-2.5 text-sm font-semibold"><LogIn className="h-4 w-4" />Connexion</Link>}
          {allowSwitch && <button onClick={() => setMode(mode === "dark" ? "light" : "dark")} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/60 px-3 py-2.5 text-left text-sm font-semibold">{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{mode === "dark" ? "Mode clair" : "Mode sombre"}</button>}
        </div>
      </nav>}
    </header>
  );
}
