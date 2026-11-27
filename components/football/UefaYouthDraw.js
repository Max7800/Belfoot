"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { INTERNATIONAL_DRAW_EVENTS, UEFA_DRAW_SNAPSHOTS_KEY, validStoredUefaDraw } from "@/lib/internationalDrawWatch";
import { teamCategory, teamGender } from "@/lib/nationalCategories";

export default function UefaYouthDraw({ team = null, competition = null, season = null }) {
  const category = team && teamGender(team) === "men" ? teamCategory(team) : null;
  const event = INTERNATIONAL_DRAW_EVENTS.find((item) => ["u17", "u19"].includes(item.category) && (team ? item.category === category : competition?.provider === "apifootball" && String(competition?.external_id) === item.apiCompetition && season === item.siteSeason));
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    setState(null);
    if (event) supabase.from("site_settings").select("data").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (active && !error) setState(data?.data?.[UEFA_DRAW_SNAPSHOTS_KEY]?.[event.id] || null);
    }).catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, [event]);
  if (!event || !Number.isFinite(Date.parse(state?.observedAt || "")) || !validStoredUefaDraw(event, state.groups) || Date.now() >= Date.parse("2027-04-01T00:00:00Z")) return null;
  const groups = team ? state.groups.filter((group) => group.teams?.some((entry) => entry.code === "BEL")) : state.groups;
  if (!groups.length) return null;
  return <section className="rounded-2xl border border-amber-400/20 bg-surface/60 p-4">
    <h2 className="text-sm font-black uppercase tracking-wider text-amber-300">{event.title} · tirage officiel</h2>
    <p className="mt-2 text-xs text-muted"><a href={`https://www.uefa.com/under${event.category === "u17" ? "17" : "19"}/standings/`} target="_blank" rel="noreferrer" className="underline">Source UEFA</a> · relevé du {new Date(state.observedAt).toLocaleString("fr-BE")}. Groupes du tirage, sans classement ni calendrier déduits.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{groups.map((group) => <div key={group.id} className="rounded-xl border border-line/10 p-3"><h3 className="text-xs font-black uppercase text-muted">{group.label}</h3><p className="mt-2 text-sm">{group.teams.map((entry) => entry.name).join(" · ")}</p></div>)}</div>
  </section>;
}
