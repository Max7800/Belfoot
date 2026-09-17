"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

export const STATS_SECTIONS = [
  { key: "overview", label: "Vue d'ensemble", accent: "#ef4444" },
  { key: "scorers", label: "Buteurs", accent: "#f4c430" },
  { key: "assists", label: "Passeurs", accent: "#ef4444" },
  { key: "clean_sheets", label: "Clean sheets", accent: "#38bdf8" },
  { key: "minutes", label: "Minutes jouées", accent: "#a78bfa" },
  { key: "lineups", label: "Titularisations", accent: "#34d399" },
  { key: "ratings", label: "Meilleures notes", accent: "#fb7185" },
];

export const DEFAULT_STATS_HEADER = {
  title: "Les chiffres de la saison",
  subtitle: "Les tendances collectives et les joueurs qui font la différence.",
};

export function normalizeStatsConfig(raw = {}) {
  const sections = raw.sections && typeof raw.sections === "object" ? raw.sections : {};
  return {
    title: raw.title || DEFAULT_STATS_HEADER.title,
    subtitle: raw.subtitle || DEFAULT_STATS_HEADER.subtitle,
    sections: STATS_SECTIONS.map((section, index) => ({
      ...section,
      enabled: sections[section.key]?.enabled !== false,
      order: Number.isFinite(sections[section.key]?.order) ? sections[section.key].order : index,
      label: sections[section.key]?.label || section.label,
      accent: sections[section.key]?.accent || section.accent,
    })).sort((a, b) => a.order - b.order),
  };
}

export function useStatsSections(competitionId) {
  const [raw, setRaw] = useState({});
  useEffect(() => {
    if (!competitionId) return;
    supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data }) => {
      const all = (data?.data && data.data.competition_stats) || {};
      setRaw(all[competitionId] || all.default || {});
    }).catch(() => setRaw({}));
  }, [competitionId]);
  return useMemo(() => normalizeStatsConfig(raw), [raw]);
}
