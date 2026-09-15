"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

let _cache = null;
// Hook : renvoie une fonction L(key, fallback). Les textes sont éditables en admin
// (Réglages -> Textes) et stockés dans site_settings.data.labels. Le fallback = défaut code.
export function useLabels() {
  const [labels, setLabels] = useState(_cache || {});
  useEffect(() => {
    if (_cache) { setLabels(_cache); return; }
    supabase.from("site_settings").select("data").eq("id", 1).maybeSingle()
      .then(({ data }) => { _cache = (data?.data && data.data.labels) || {}; setLabels(_cache); })
      .catch(() => {});
  }, []);
  return (key, fallback) => (labels[key] ?? fallback);
}
