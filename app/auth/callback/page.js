"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallback() {
  const router = useRouter();
  useEffect(() => {
    let done = false;
    const go = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || done) return;
      done = true;
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      router.replace(prof?.role === "admin" ? "/admin" : "/compte");
    };
    go();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s) go(); });
    const t = setTimeout(() => { if (!done) router.replace("/"); }, 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, [router]);
  return <p className="text-muted">Connexion…</p>;
}
