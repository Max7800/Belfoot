"use client";
import Link from "next/link";
import { Sun, Moon, Shield, Search, LogIn, LogOut, User } from "lucide-react";
import siteConfig from "@/config/site";
import { navItems } from "@/lib/modules";
import { useThemeMode } from "./ThemeModeProvider";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

export default function Navbar() {
  const { mode, setMode, allowSwitch } = useThemeMode();
  const { session, isAdmin } = useAuth();
  return (
    <header className="border-b border-line/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-black">{siteConfig.name}</Link>
        <nav className="flex items-center gap-4 text-sm">
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
      </div>
    </header>
  );
}
