"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import OAuthButtons from "@/components/auth/OAuthButtons";
import siteConfig from "@/config/site";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login");   // login | signup | forgot
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const emailOn = siteConfig.auth?.email !== false;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password: pw }); if (error) throw error;
        setMsg("Compte créé. Valide l'email si demandé, puis connecte-toi."); setMode("login");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` }); if (error) throw error;
        setMsg("Si un compte existe, un email de réinitialisation vient d'être envoyé.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw }); if (error) throw error;
        router.push("/auth/callback");
      }
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  };

  const box = "w-full rounded border border-line/10 bg-surface px-3 py-2 outline-none focus:border-accent";
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-black">Connexion</h1>
      <OAuthButtons />
      {emailOn && (
        <>
          <div className="my-4 text-center text-xs uppercase tracking-wider text-muted">ou par email</div>
          <form onSubmit={submit} className="space-y-3">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className={box} />
            {mode !== "forgot" && <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Mot de passe" required className={box} />}
            <button disabled={busy} className="w-full rounded bg-accent px-4 py-2 font-bold text-white">{mode === "signup" ? "Créer le compte" : mode === "forgot" ? "Envoyer le lien" : "Se connecter"}</button>
          </form>
          <div className="mt-3 flex justify-between text-xs text-muted">
            <button onClick={() => setMode(mode === "signup" ? "login" : "signup")} className="hover:text-content">{mode === "signup" ? "J'ai déjà un compte" : "Créer un compte"}</button>
            <button onClick={() => setMode("forgot")} className="hover:text-content">Mot de passe oublié ?</button>
          </div>
        </>
      )}
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </div>
  );
}
