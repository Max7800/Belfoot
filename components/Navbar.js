"use client";
import Link from "next/link";
import { Sun, Moon, Shield, Search } from "lucide-react";
import siteConfig from "@/config/site";
import { navItems } from "@/lib/modules";
import { useThemeMode } from "./ThemeModeProvider";

export default function Navbar() {
  const { mode, setMode, allowSwitch } = useThemeMode();
  return (
    <header className="border-b border-line/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-black">{siteConfig.name}</Link>
        <nav className="flex items-center gap-4 text-sm">
          {navItems().map((i) => <Link key={i.to} href={i.to} className="text-muted hover:text-content">{i.label}</Link>)}
          {siteConfig.modules?.search && <Link href="/recherche" className="text-muted hover:text-content" title="Rechercher"><Search className="h-4 w-4" /></Link>}
          <Link href="/admin" className="text-muted hover:text-content" title="Admin"><Shield className="h-4 w-4" /></Link>
          {allowSwitch && (
            <button onClick={() => setMode(mode === "dark" ? "light" : "dark")} className="text-muted hover:text-content" aria-label="Basculer le thème">
              {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
