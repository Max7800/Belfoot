// Registre unifié : le shell (admin, nav) ne voit QUE des modules,
// qu'ils soient des collections déclaratives ou des modules métier.
import siteConfig from "@/config/site";
import { collectionList } from "@/config/collections";
import { modules as declared } from "@/config/modules";

export const enabledModules = () => {
  const on = declared.filter((m) => m.enabled !== false);
  const keys = new Set(on.map((m) => m.key));
  return on.filter((m) => (m.requires || []).every((r) => keys.has(r)));  // dépendances satisfaites
};

export function capabilityPanels() {
  return [
    { key: "contributions", label: "Contributions", icon: "inbox", kind: "capability" },
    { key: "categories", label: "Catégories", icon: "tag", kind: "capability" },
  ];
}

export function adminPanels() {
  const cols = collectionList().map((c) => ({ key: c.key, label: c.label, icon: c.icon || "layers", kind: "collection" }));
  const mods = enabledModules().flatMap((m) =>
    (m.adminPanels || []).map((p) => ({ key: p.key, label: p.label, icon: p.icon || m.icon || "box", kind: "module", module: m.key }))
  );
  return [...capabilityPanels(), ...cols, ...mods];
}

export function navItems() {
  return [...(siteConfig.nav || []), ...enabledModules().flatMap((m) => m.nav || [])];
}
