"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export const HOME_SECTIONS = [
  { key: "jpl", label: "Jupiler Pro League", subtitle: "Le championnat belge en un coup d'œil.", action: "Voir la compétition" },
  { key: "watch", label: "Les Belges à suivre aujourd'hui", subtitle: "Les rencontres des joueurs belges suivis à l'étranger.", action: "Voir tous les matchs" },
  { key: "form", label: "En forme", subtitle: "Les Belges qui performent ces dernières semaines.", action: "Voir tous les joueurs" },
  { key: "leagues", label: "Le tour des Belges", subtitle: "Nos championnats majeurs.", action: "Voir tous les championnats" },
  { key: "news", label: "Dernières actualités", subtitle: "Toute l'actu du foot belge et de ses joueurs.", action: "Voir toutes les actus" },
  { key: "brief", label: "En bref", subtitle: "", action: "" },
  { key: "europe", label: "Les clubs belges en Europe", subtitle: "Les prochains rendez-vous européens des clubs belges.", action: "Tous les matchs", enabled: false },
];

export const HOME_HERO = {
  kicker: "Le football belge, sans frontières",
  title: "Les Belges.\nPartout dans le monde.",
  subtitle: "Le championnat, les Diables et tous les Belges qui font parler d'eux au-delà de nos frontières.",
  primary_label: "Suivre les Belges",
  primary_url: "/belges-a-l-etranger",
  secondary_label: "Voir les compétitions",
  secondary_url: "/competitions",
  image_url: "",
};

export function normalizeHomeConfig(value = {}) {
  const stored = value.sections || {};
  return {
    hero: { ...HOME_HERO, ...(value.hero || {}) },
    sections: HOME_SECTIONS.map((section, index) => ({
      ...section,
      ...(stored[section.key] || {}),
      enabled: stored[section.key]?.enabled ?? section.enabled ?? true,
      order: stored[section.key]?.order ?? index,
    })).sort((a, b) => a.order - b.order),
  };
}

let cache = null;
export function useHomeConfig() {
  const [config, setConfig] = useState(cache || normalizeHomeConfig());
  useEffect(() => {
    supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data }) => {
      cache = normalizeHomeConfig(data?.data?.home || {});
      setConfig(cache);
    }).catch(() => {});
  }, []);
  return config;
}
