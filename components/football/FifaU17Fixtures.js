"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { frenchNationName } from "@/lib/frenchNations";
import { FIFA_U17_FIXTURES_KEY, FIFA_U17_PUBLIC_SOURCE, FIFA_U17_STAGES, fifaFixtureInMatches, validFifaStage } from "@/lib/fifaU17Fixtures";

const displayName = (name) => frenchNationName(({ "Côte d'Ivoire": "Ivory Coast", "Republic of Ireland": "Ireland", "Korea Republic": "South Korea" })[name] || name);

export default function FifaU17Fixtures({ enabled, matches = [], clubs = {}, belgiumOnly = false }) {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    let active = true;
    setSnapshot(null);
    if (enabled) supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (active && !error) setSnapshot(data?.data?.[FIFA_U17_FIXTURES_KEY] || null);
    }).catch(() => { if (active) setSnapshot(null); });
    return () => { active = false; };
  }, [enabled]);
  if (!enabled || !snapshot?.observedAt) return null;
  const stages = Object.entries(FIFA_U17_STAGES).flatMap(([id, info]) => {
    const items = snapshot.stages?.[id];
    if (!validFifaStage(id, items)) return [];
    const missing = items.filter((fixture) => (!belgiumOnly || [fixture.home.name, fixture.away.name].includes("Belgium")) && !fifaFixtureInMatches(fixture, matches, clubs));
    return missing.length ? [{ ...info, id, matches: missing, observedAt: snapshot.stageObservedAt?.[id] || snapshot.observedAt }] : [];
  });
  if (!stages.length) return null;
  return <section className="rounded-2xl border border-amber-400/20 bg-surface/60 p-4">
    <h2 className="text-sm font-black uppercase tracking-wider text-amber-300">{belgiumOnly ? "Mondial U17 · programme de la Belgique" : "Phase finale · programme officiel"}</h2>
    <p className="mt-2 text-xs text-muted">Programme officiel · <a href={FIFA_U17_PUBLIC_SOURCE} target="_blank" rel="noreferrer" className="underline">source FIFA</a>. Scores non disponibles dans ce programme.</p>
    {stages.map((stage) => <div key={stage.id} className="mt-4"><h3 className="text-xs font-bold uppercase text-muted">{stage.label} · relevé du {new Date(stage.observedAt).toLocaleString("fr-BE")}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{stage.matches.map((match) => <div key={match.id} className="rounded-xl border border-line/10 bg-surface p-3"><div className="text-xs text-muted">{new Date(match.kickoff).toLocaleString("fr-BE", { dateStyle: "medium", timeStyle: "short" })}</div><div className="mt-1 text-sm font-bold">{displayName(match.home.name)} – {displayName(match.away.name)}</div></div>)}</div></div>)}
  </section>;
}
