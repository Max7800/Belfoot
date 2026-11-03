"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps";
import { geoCentroid, geoArea } from "d3-geo";
import { UNKNOWN_COUNTRY } from "@/lib/belgiansAbroad";
import { geoName, groupMapPlayers } from "@/lib/belgiansMapGroups";

// Ancre de la pastille : centroïde du PLUS GRAND polygone du pays, pas le centroïde
// global. Sinon les territoires d'outre-mer (France+Guyane, Espagne+Canaries,
// Pays-Bas+Caraïbes, USA+Alaska…) tirent le point à côté — ex. la France finissait
// au-dessus du Portugal.
function badgeAnchor(geo) {
  const g = geo.geometry;
  if (!g) return geoCentroid(geo);
  if (g.type === "MultiPolygon") {
    let best = null, bestArea = -1;
    for (const coordinates of g.coordinates) {
      const poly = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates } };
      const area = geoArea(poly);
      if (area > bestArea) { bestArea = area; best = poly; }
    }
    if (best) return geoCentroid(best);
  }
  return geoCentroid(geo);
}

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Vues par continent (centre [lng, lat] + zoom).
const VIEWS = {
  monde: { label: "🌍 Monde", center: [12, 28], zoom: 1 },
  europe: { label: "🇪🇺 Europe", center: [14, 54], zoom: 4.5 },
  ameriques: { label: "🌎 Amériques", center: [-80, 5], zoom: 1.7 },
  afrique: { label: "🌍 Afrique", center: [20, 2], zoom: 2.2 },
  asie: { label: "🌏 Asie", center: [95, 28], zoom: 2 },
};

export default function BelgiansWorldMap({ players = [], selection = null, onSelect = () => {} }) {
  const [viewKey, setViewKey] = useState("europe");
  const [tooltip, setTooltip] = useState(null);
  const view = VIEWS[viewKey];

  const byCountry = useMemo(() => groupMapPlayers(players, UNKNOWN_COUNTRY), [players]);

  const max = Math.max(1, ...Object.values(byCountry).map((c) => c.list.length));
  const fillFor = (n) => (n ? `rgba(227,6,19,${(0.22 + 0.63 * (n / max)).toFixed(2)})` : "rgba(255,255,255,0.045)");
  const selected = selection ? geoName(selection.key) : null;
  const current = selected && byCountry[selected];
  const badgeR = viewKey === "monde" ? 7 : 3.5;

  return (
    <div className="min-w-0 px-1 py-2 sm:px-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-wider text-amber-300">🌍 Les Belges dans le monde</div>
        <div className="text-[11px] text-muted">{players.length} Belge{players.length > 1 ? "s" : ""} à l’étranger</div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {Object.entries(VIEWS).map(([key, v]) => (
          <button key={key} onClick={() => { setViewKey(key); onSelect(null); }} className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${viewKey === key ? "bg-accent text-white" : "bg-surface2 text-muted hover:text-content"}`}>{v.label}</button>
        ))}
      </div>

      <div className="mb-2 text-[11px] text-muted">👆 Clique sur une <span className="font-bold text-accent">pastille rouge</span> (ou le pays surligné) pour voir les Belges qui y jouent.</div>

      <div className="relative overflow-hidden">
        <style>{`@keyframes bfHalo{0%,100%{opacity:.12}50%{opacity:.4}}.bf-halo{animation:bfHalo 2.2s ease-in-out infinite;}.bf-badge{transition:transform .12s ease;transform-box:fill-box;transform-origin:center;}.bf-badge:hover{transform:scale(1.25);}.bf-geo:hover{fill:rgba(255,255,255,0.07);stroke:rgba(255,255,255,0.25);stroke-width:.5;}.bf-geo-active{cursor:pointer;}.bf-geo-active:hover,.bf-geo-active:active{fill:#e30613;}.bf-geo-active:focus-visible{stroke:white;stroke-width:1.2;outline:none;}`}</style>
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
                        onClick={() => n && onSelect(selected === name ? null : entry)}
                        role={n ? "button" : undefined}
                        tabIndex={n ? 0 : -1}
                        aria-label={n ? `${entry.label} : ${n} joueur${n > 1 ? "s" : ""}` : undefined}
                        onKeyDown={(event) => { if (n && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(selected === name ? null : entry); } }}
                        // react-simple-maps 5 : Geography reçoit des attributs SVG ordinaires
                        // (l'objet { default, hover, pressed } de la v3 était ignoré : pays
                        // tous noirs, sans couleur ni survol). Survol / clic en CSS (.bf-geo).
                        fill={selected === name ? "#e30613" : fillFor(n)}
                        stroke={selected === name ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.1)"}
                        strokeWidth={0.4}
                        className={n ? "bf-geo bf-geo-active" : "bf-geo"}
                      />
                    );
                  })}
                  {geographies.map((geo) => {
                    const name = geo.properties.name;
                    const entry = byCountry[name];
                    if (!entry) return null;
                    const centroid = badgeAnchor(geo);
                    if (!centroid || Number.isNaN(centroid[0])) return null;
                    const n = entry.list.length;
                    return (
                      <Marker
                        key={`c-${geo.rsmKey}`}
                        coordinates={centroid}
                        onMouseEnter={() => setTooltip({ name: entry.label, count: n })}
                        onMouseLeave={() => setTooltip(null)}
                        onClick={() => onSelect(selected === name ? null : entry)}
                        style={{ cursor: "pointer" }}
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
        <div className="mt-3 lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-black">{current.label} <span className="text-muted">— {current.list.length} Belge(s)</span></div>
            <button onClick={() => onSelect(null)} className="text-[11px] text-muted hover:text-content">Fermer ✕</button>
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
