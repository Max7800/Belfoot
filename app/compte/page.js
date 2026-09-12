"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";

export default function ComptePage() {
  const { session, role, loading } = useAuth();
  const [username, setUsername] = useState(""); const [saved, setSaved] = useState(false);
  useEffect(() => { if (session) supabase.from("profiles").select("username").eq("id", session.user.id).maybeSingle().then(({ data }) => setUsername(data?.username || "")); }, [session]);
  if (loading) return <p className="text-muted">…</p>;
  if (!session) return <p className="text-muted">Connecte-toi pour voir ton compte.</p>;
  const save = async () => { await supabase.from("profiles").update({ username }).eq("id", session.user.id); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-xl font-black">Mon compte</h1>
      <div className="text-sm text-muted">{session.user.email} · rôle : {role}</div>
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Pseudo</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded border border-line/10 bg-surface px-3 py-2 outline-none focus:border-accent" />
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded bg-accent px-4 py-2 text-sm font-bold text-white">Enregistrer</button>
        {saved && <span className="text-xs text-green-400">✓</span>}
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-muted hover:text-content">Se déconnecter</button>
      </div>
    </div>
  );
}
