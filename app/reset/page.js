"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPage() {
  const router = useRouter();
  const [pw, setPw] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? error.message : "Mot de passe mis à jour."); setBusy(false);
    if (!error) setTimeout(() => router.push("/auth/callback"), 1200);
  };
  const box = "w-full rounded border border-line/10 bg-surface px-3 py-2 outline-none focus:border-accent";
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-black">Nouveau mot de passe</h1>
      <form onSubmit={submit} className="space-y-3">
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Nouveau mot de passe" required className={box} />
        <button disabled={busy} className="w-full rounded bg-accent px-4 py-2 font-bold text-white">Mettre à jour</button>
      </form>
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </div>
  );
}
