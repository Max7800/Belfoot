"use client";
import { supabase } from "@/lib/supabaseClient";
import siteConfig from "@/config/site";

// Métadonnées par provider (neutralisé : rien de spécifique à un site).
const PROVIDERS = {
  google:  { label: "Google",  scopes: undefined,         bg: "#ffffff", fg: "#1f2937", border: true },
  discord: { label: "Discord", scopes: "identify email",  bg: "#5865F2", fg: "#ffffff" },
  twitch:  { label: "Twitch",  scopes: "user:read:email", bg: "#9146FF", fg: "#ffffff" },
};

export default function OAuthButtons() {
  const providers = siteConfig.auth?.providers || [];
  if (!providers.length) return null;
  const signIn = (p) => supabase.auth.signInWithOAuth({
    provider: p,
    options: { scopes: PROVIDERS[p]?.scopes, redirectTo: `${window.location.origin}/auth/callback` },
  });
  return (
    <div className="space-y-2">
      {providers.map((p) => {
        const m = PROVIDERS[p]; if (!m) return null;
        return (
          <button key={p} type="button" onClick={() => signIn(p)}
            className="flex w-full items-center justify-center gap-2 rounded-md py-3 text-sm font-bold uppercase tracking-wider transition hover:opacity-90"
            style={{ background: m.bg, color: m.fg, border: m.border ? "1px solid rgb(var(--line) / .2)" : "none" }}>
            Continuer avec {m.label}
          </button>
        );
      })}
    </div>
  );
}
