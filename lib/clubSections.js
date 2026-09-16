"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export const CLUB_SECTIONS = [
  { key: "squad", label: "Effectif" },
  { key: "linked", label: "Équipes liées" },
  { key: "last", label: "Derniers matchs" },
  { key: "next", label: "Prochains matchs" },
];
let _cache = null;
export function useClubSections() {
  const [cfg, setCfg] = useState(_cache);
  useEffect(() => {
    if (_cache) { setCfg(_cache); return; }
    supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data }) => { _cache = (data?.data && data.data.club_sections) || {}; setCfg(_cache); }).catch(() => {});
  }, []);
  const conf = cfg || {};
  return CLUB_SECTIONS.map((s, i) => ({ ...s, enabled: conf[s.key]?.enabled !== false, order: conf[s.key]?.order ?? i }))
    .filter((s) => s.enabled).sort((a, b) => a.order - b.order);
}
