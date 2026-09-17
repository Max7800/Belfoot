"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export const DEFAULT_COMPETITION_HUB = {
  kicker: "Le football belge",
  title: "Chaque compétition a son histoire.",
  intro: "Entrez dans l'univers des compétitions suivies par Belfoot : calendrier, clubs, classements et statistiques, réunis sans mélanger les formats.",
  banner_url: "",
  overlay: 0.62,
};

let cache = null;
export function useCompetitionHub() {
  const [config, setConfig] = useState(cache || DEFAULT_COMPETITION_HUB);
  useEffect(() => {
    supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data }) => {
      cache = { ...DEFAULT_COMPETITION_HUB, ...(data?.data?.competition_hub || {}) };
      setConfig(cache);
    }).catch(() => {});
  }, []);
  return config;
}
