"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps";
import { geoCentroid } from "d3-geo";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Nom pays Belfoot -> nom du fond de carte (world-atlas). À ajuster au fil de l'eau.
const COUNTRY_ALIAS = {
  "England": "United Kingdom", "Scotland": "United Kingdom", "Wales": "United Kingdom", "Northern Ireland": "United Kingdom",
  "USA": "United States of America", "United States": "United States of America",
  "Türkiye": "Turkey", "Czechia": "Czech Republic", "Czech Republic": "Czech Republic",
  "South Korea": "South Korea", "North Macedonia": "North Macedonia", "Bosnia & Herzegovina": "Bosnia and Herz.",
  "Ivory Coast": "Côte d'Ivoire", "Saudi Arabia": "Saudi Arabia", "UAE": "United Arab Emirates",
  "Serbia": "Serbia", "Russia": "Russia", "Netherlands": "Netherlands",
};
const geoName = (c) => COUNTRY_ALIAS[c] || c;

// Vues par continent (centre [lng, lat] + zoom).
const VIEWS = {
  monde: { label: "🌍 Monde", center: [12, 28], zoom: 1 },
  europe: { label: "🇪🇺 Europe", center: [14, 54], zoom: 4.5 },
  ameriques: { label: "🌎 Amériques", center: [-80, 5], zoom: 1.7 },
  afrique: { label: "🌍 Afrique", center: [20, 2], zoom: 2.2 },
  asie: { label: "🌏 Asie", center: [95, 28], zoom: 2 },
};

export default function BelgiansWorldMap({ players = [] }) {
  const [viewKey, setViewKey] = useState("europe");
  const [selected, setSelected] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const view = VIEWS[viewKey];

  const byCountry = useMemo(() => {
    const map = {};
    for (const p of players) {
      const raw = p?.country;
      if (!raw || raw === "À renseigner") continue;
      const name = geoName(raw);
      (map[name] ||= { label: raw, list: [] }).list.push(p);
    }
    return map;
  }, [players]);

  const max = Math.max(1, ...Object.values(byCountry).map((c) => c.list.length));
  const fillFor = (n) => (n ? `rgba(227,6,19,${(0.22 + 0.63 * (n / max)).toFixed(2)})` : "rgba(255,255,255,0.045)");
  const current = selected && byCountry[selected];
  const badgeR = viewKey === "monde" ? 7 : 3.5;

  return (
    <div className="rounded-2xl border border-line/10 bg-surface/60 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-wider text-amber-300">🌍 Les Belges dans le monde</div>
        <div className="text-[11px] text-muted">{players.length} exilé(s)</div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {Object.entries(VIEWS).map(([key, v]) => (
          <button key={key} onClick={() => { setViewKey(key); setSelected(null); }} className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${viewKey === key ? "bg-accent text-white" : "bg-surface2 text-muted hover:text-content"}`}>{v.label}</button>
        ))}
      </div>

      <div className="mb-2 text-[11px] text-muted">👆 Clique sur un <span className="font-bold text-accent">pastille rouge</span> (ou le pays surligné) pour voir les Belges qui y jouent.</div>

      <div className="relative overflow-hidden rounded-xl bg-[#0b1220]">
        <style>{`.rsm-svg,.rsm-geographies,.rsm-geography,.rsm-zoomable-group,.rsm-svg *{outline:none!important;}.rsm-svg:focus,.rsm-zoomable-group:focus{outline:none!important;}@keyframes bfHalo{0%,100%{opacity:.12}50%{opacity:.4}}.bf-halo{animation:bfHalo 2.2s ease-in-out infinite;}.bf-badge{transition:transform .12s ease;transform-box:fill-box;transform-origin:center;}.bf-badge:hover{transform:scale(1.25);}`}</style>
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 130 }} style={{ width: "100%", height: "auto", outline: "none" }}>
          <ZoomableGroup center={view.center} zoom={view.zoom} maxZoom={8}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) => (
                <>
                  {geographies.map((geo) => {
                    const name = geo.properties.name;
                    const entry = byCountry[name];
                    const n = entry?.list.length || 0;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onMouseEnter={() => n && setTooltip({ name: entry.label, count: n })}
                        onMouseLeave={() => setTooltip(null)}
                        onClick={() => n && setSelected((s) => (s === name ? null : name))}
                        style={{
                          default: { fill: fillFor(n), stroke: "rgba(255,255,255,0.1)", strokeWidth: 0.4, outline: "none" },
                          hover: { fill: n ? "#e30613" : "rgba(255,255,255,0.07)", outline: "none", cursor: n ? "pointer" : "default", stroke: "rgba(255,255,255,0.25)", strokeWidth: 0.5 },
                          pressed: { fill: "#e30613", outline: "none" },
                        }}
                      />
                    );
                  })}
                  {geographies.map((geo) => {
                    const name = geo.properties.name;
                    const entry = byCountry[name];
                    if (!entry) return null;
                    const centroid = geoCentroid(geo);
                    if (!centroid || Number.isNaN(centroid[0])) return null;
                    const n = entry.list.length;
                    return (
                      <Marker
                        key={`c-${geo.rsmKey}`}
                        coordinates={centroid}
                        onMouseEnter={() => setTooltip({ name: entry.label, count: n })}
                        onMouseLeave={() => setTooltip(null)}
                        onClick={() => setSelected((s) => (s === name ? null : name))}
                        style={{ default: { cursor: "pointer" }, hover: { cursor: "pointer" }, pressed: { cursor: "pointer" } }}
                      >
                        <circle className="bf-halo" r={badgeR + 2} fill="#e30613" style={{ pointerEvents: "none" }} />
                        <g className="bf-badge">
                          <circle r={badgeR} fill="#e30613" stroke="#fff" strokeWidth={0.7} style={{ cursor: "pointer" }} />
                          <text textAnchor="middle" y={badgeR * 0.38} fontSize={badgeR * 1.05} fontWeight="900" fill="#fff" style={{ pointerEvents: "none" }}>{n}</text>
                        </g>
                      </Marker>
                    );
                  })}
                </>
              )}
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
        {tooltip && (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg bg-black/85 px-3 py-1 text-xs font-bold text-white">
            {tooltip.name} · {tooltip.count} Belge{tooltip.count > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {current && (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-black">{current.label} <span className="text-muted">— {current.list.length} Belge(s)</span></div>
            <button onClick={() => setSelected(null)} className="text-[11px] text-muted hover:text-content">Fermer ✕</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {current.list.map((p) => (
              <Link key={p.player.id} href={`/players/${p.player.id}`} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface2 p-2 transition hover:border-accent/40">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-sm">
                  {p.player?.photo_url ? <img src={p.player.photo_url} className="h-9 w-9 object-cover" alt="" onError={(e) => e.currentTarget.remove()} /> : "👤"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{p.player.name}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-muted">{p.club?.logo_url && <img src={p.club.logo_url} className="h-3.5 w-3.5 object-contain" alt="" />}{p.club?.name || "—"}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
