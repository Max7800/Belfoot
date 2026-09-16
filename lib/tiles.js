"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const DEFAULTS = {
  topscorer: { cls: "border-amber-400/40 bg-gradient-to-br from-amber-400/10 to-transparent", wm: "⚽", accent: "#f4c430" },
  topassist: { cls: "border-red-500/40 bg-gradient-to-br from-red-500/10 to-transparent", wm: "👟", accent: "#ef4444" },
  cleansheet: { cls: "border-sky-400/40 bg-gradient-to-br from-sky-400/10 to-transparent", wm: "🧤", accent: "#38bdf8" },
  note: { cls: "border-violet-400/40 bg-gradient-to-br from-violet-400/10 to-transparent", wm: "⭐", accent: "#a78bfa" },
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
