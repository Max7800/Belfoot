"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Classements administrables (saisis à la main — ni API-Football, ni source auto) :
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
      .then(({ data }) => setR(normalizeRankings(data?.data?.rankings)))
      .catch(() => {});
  }, []);
  return r;
}
