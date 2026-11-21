"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { nationalityBadges } from "./nationalities";

// Classements administrables, avec snapshot FIFA automatique facultatif :
// - fifa : fenêtre de nations autour de la Belgique (rang, nation, points, isBelgium)
// - uefa : coefficient UEFA de la Belgique (rang pays, points, tendance)
// Stockés dans site_settings.data.rankings.
export function normalizeRankings(raw = {}) {
  const fifa = Array.isArray(raw?.fifa)
    ? raw.fifa.filter((r) => r && r.nation).map((r) => ({ rank: r.rank ?? "", nation: r.nation, points: r.points ?? "", isBelgium: !!r.isBelgium }))
    : [];
  const u = raw?.uefa && typeof raw.uefa === "object" ? raw.uefa : {};
  return { fifa, uefa: { rank: u.rank ?? "", points: u.points ?? "", trend: u.trend || "" } };
}

export function useRankings() {
  const [r, setR] = useState(() => normalizeRankings());
  useEffect(() => {
    supabase.from("site_settings").select("data").eq("id", 1).maybeSingle()
      .then(({ data }) => {
        const settings = data?.data || {};
        const manual = normalizeRankings(settings.rankings);
        const snapshot = settings.football_fifa_rankings_auto;
        if (settings.football_fifa_rankings_enabled !== false && Array.isArray(snapshot?.entries) && snapshot.entries.length >= 150 && snapshot.entries.some((entry) => entry.code === "BEL")) {
          const entries = snapshot.entries.filter((entry) => entry.rank <= 10 || entry.code === "BEL");
          setR({ ...manual, fifa: entries.map((entry) => ({ ...entry, nation: nationalityBadges(entry.nation)[0]?.label || entry.nation, isBelgium: entry.code === "BEL" })), fifaCheckedAt: snapshot.checkedAt, fifaSource: snapshot.source });
        } else setR(manual);
      })
      .catch(() => {});
  }, []);
  return r;
}
