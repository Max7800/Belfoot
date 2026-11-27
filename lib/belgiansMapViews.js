// Cadrages adaptés au canevas 1000 × 360 ; la version mobile reste plus haute.
export const MAP_VIEWS = {
  monde: { label: "🌍 Monde", center: [10, 18], zoom: 0.65 },
  europe: { label: "🇪🇺 Europe", center: [14, 51], zoom: 1.55 },
  ameriques: { label: "🌎 Amériques", center: [-80, 8], zoom: 0.8 },
  afrique: { label: "🌍 Afrique", center: [20, 2], zoom: 1.1 },
  asie: { label: "🌏 Asie", center: [95, 28], zoom: 1 },
};
export const COMPACT_ZOOM = { monde: 1, europe: 4.1, ameriques: 1.7, afrique: 2.2, asie: 2 };
