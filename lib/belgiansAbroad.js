"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export const BELGIANS_ABROAD_SECTIONS = [
  { key: "players", label: "Tous les Belges suivis", subtitle: "Recherchez un joueur par pays, championnat ou poste.", action: "", accent: "#e30613" },
  { key: "today", label: "Les Belges à suivre", subtitle: "Les prochains rendez-vous de nos joueurs à l'étranger.", action: "Voir les matchs", accent: "#fbbf24" },
  { key: "form", label: "En forme", subtitle: "Les Belges qui se distinguent en ce moment.", action: "Voir les joueurs", accent: "#fb923c" },
  { key: "leagues", label: "Le tour des Belges", subtitle: "Explorez les championnats dans lesquels évoluent les joueurs suivis.", action: "", accent: "#38bdf8" },
  { key: "recap", label: "Dernières performances", subtitle: "Leurs dernières apparitions, match après match.", action: "Voir les matchs", accent: "#a78bfa" },
];

export const BELGIANS_ABROAD_HERO = {
  kicker: "Belfoot à l'étranger",
  title: "Les Belges. Partout.",
  intro: "Retrouvez les joueurs belges suivis hors de Belgique, leurs rendez-vous et leurs performances.",
  image_url: "",
  overlay: 0.42,
  featured_player_id: "",
  players_label: "Joueurs",
  countries_label: "Pays",
  clubs_label: "Clubs",
};

export function normalizeBelgiansAbroadConfig(value = {}) {
  const stored = value.sections || {};
  return {
    hero: { ...BELGIANS_ABROAD_HERO, ...(value.hero || {}) },
    sections: BELGIANS_ABROAD_SECTIONS.map((section, index) => ({
      ...section,
      ...(stored[section.key] || {}),
      enabled: stored[section.key]?.enabled ?? true,
      order: stored[section.key]?.order ?? index,
    })).sort((a, b) => a.order - b.order),
  };
}

let cache = null;
export function useBelgiansAbroadConfig() {
  const [config, setConfig] = useState(cache || normalizeBelgiansAbroadConfig());
  useEffect(() => {
    supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data }) => {
      cache = normalizeBelgiansAbroadConfig(data?.data?.belgians_abroad || {});
      setConfig(cache);
    }).catch(() => {});
  }, []);
  return config;
}
