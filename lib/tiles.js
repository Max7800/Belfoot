"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Accents par défaut (sans image) — subtils. L'admin peut ajouter un background_url + overlay.
const DEFAULTS = {
  topscorer: { cls: "border-amber-400/40 bg-gradient-to-br from-amber-400/10 to-transparent", wm: "⚽" },
  topassist: { cls: "border-red-500/40 bg-gradient-to-br from-red-500/10 to-transparent", wm: "👟" },
  toprating: { cls: "border-slate-300/30 bg-gradient-to-br from-slate-300/10 to-transparent", wm: "⭐" },
  upcoming: { cls: "border-line/10 bg-gradient-to-b from-[#12305a]/50 to-transparent", wm: "🏟️" },
};
let _cache = null;
export function useTiles() {
  const [cfg, setCfg] = useState(_cache || {});
  useEffect(() => {
    if (_cache) { setCfg(_cache); return; }
    supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data }) => { _cache = (data?.data && data.data.tiles) || {}; setCfg(_cache); }).catch(() => {});
  }, []);
  return (key) => ({ ...(DEFAULTS[key] || {}), ...(cfg[key] || {}) });
}
