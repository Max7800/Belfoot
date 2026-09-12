import siteConfig from "@/config/site";
export function flag(name) { return !!(siteConfig.flags && siteConfig.flags[name]); }
