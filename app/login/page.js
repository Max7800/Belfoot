"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        router.push("/");
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pw });
        if (error) throw error;
        setMsg("Compte créé. Si la confirmation par email est activée, valide le lien reçu, puis connecte-toi.");
        setMode("login");
      }
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  };

  const box = "w-full rounded border border-line/10 bg-surface px-3 py-2 outline-none focus:border-accent";
  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <button onClick={() => setMode("login")} className={mode === "login" ? "font-bold text-content" : "text-muted"}>Connexion</button>
        <span className="text-muted">·</span>
        <button onClick={() => setMode("signup")} className={mode === "signup" ? "font-bold text-content" : "text-muted"}>Créer un compte</button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className={box} />
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Mot de passe" required className={box} />
        <button disabled={busy} className="w-full rounded bg-accent px-4 py-2 font-bold text-white">{mode === "login" ? "Se connecter" : "Créer le compte"}</button>
      </form>
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </div>
  );
}
