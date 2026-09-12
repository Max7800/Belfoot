"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Hook d'auth : session + rôle (member/admin). RLS reste la vraie barrière côté DB.
export function useAuth() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let sub;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); load(data.session); });
    sub = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); load(s); }).data.subscription;
    async function load(s) {
      if (!s) { setRole(null); setLoading(false); return; }
      const { data } = await supabase.from("profiles").select("role").eq("id", s.user.id).maybeSingle();
      setRole(data?.role || "member"); setLoading(false);
    }
    return () => sub?.unsubscribe();
  }, []);

  return { session, role, isAdmin: role === "admin", loading };
}
