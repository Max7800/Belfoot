// Modules métier activés pour ce site. Retirer une ligne = désactiver le module
// (ses tables restent, mais admin/nav/pages disparaissent proprement).
import football from "@/modules/football/manifest";
import votw from "@/modules/votw/manifest";
import forum from "@/modules/forum/manifest";
import fm from "@/modules/fm/manifest";

export const modules = [football, votw, forum, fm];
export default modules;
