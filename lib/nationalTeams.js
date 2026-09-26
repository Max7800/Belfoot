"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export const NATIONAL_TEAM_SECTIONS = [
  { key: "schedule", label: "Les prochains rendez-vous", subtitle: "Le calendrier des sélections belges.", accent: "#facc15" },
  { key: "results", label: "Les derniers résultats", subtitle: "La forme récente, match après match.", accent: "#ef4444" },
  { key: "squad", label: "La sélection", subtitle: "Les joueurs actuellement appelés.", accent: "#facc15" },
];

export const NATIONAL_TEAM_HERO = {
  kicker: "Sélections belges",
  title: "Les Diables Rouges",
  intro: "Calendrier, résultats, sélection et détails des matchs de la Belgique.",
  image_url: "",
  overlay: 0.58,
  background_color: "#13090d",
  border_color: "#7f1d1d",
  primary_color: "#ef4444",
  secondary_color: "#facc15",
};

export const NATIONAL_TEAM_LABELS = {
  featured: "Prochain / dernier match",
  all_matches: "Tous les matchs",
  fifa: "Classement FIFA",
  ratings: "Notez les Diables",
  stats_matches: "Matchs",
  stats_wins: "Victoires",
  stats_goals: "Buts",
  stats_fifa: "Classement FIFA",
  show_all_results: "Voir tous les résultats",
  show_less_results: "Réduire les résultats",
  show_all_players: "Voir tous les joueurs",
  show_less_players: "Réduire la sélection",
};

export function normalizeNationalTeamsConfig(value = {}) {
  const stored = value.sections || {};
  return {
    hero: { ...NATIONAL_TEAM_HERO, ...(value.hero || {}) },
    labels: { ...NATIONAL_TEAM_LABELS, ...(value.labels || {}) },
    sections: NATIONAL_TEAM_SECTIONS.map((section, index) => ({
      ...section,
      ...(stored[section.key] || {}),
      enabled: stored[section.key]?.enabled ?? true,
      order: stored[section.key]?.order ?? index,
    })).sort((a, b) => a.order - b.order),
  };
}

let cache = null;
export function useNationalTeamsConfig() {
  const [config, setConfig] = useState(cache || normalizeNationalTeamsConfig());
  useEffect(() => {
    supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data }) => {
      cache = normalizeNationalTeamsConfig(data?.data?.national_teams || {});
      setConfig(cache);
    }).catch(() => {});
  }, []);
  return config;
}
