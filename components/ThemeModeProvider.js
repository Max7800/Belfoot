"use client";
import { createContext, useContext, useEffect, useState } from "react";
import siteConfig from "@/config/site";

const Ctx = createContext({ mode: "dark", setMode: () => {}, allowSwitch: false });
export const useThemeMode = () => useContext(Ctx);

export default function ThemeModeProvider({ children }) {
  const [mode, setMode] = useState(siteConfig.theme.defaultMode);
  useEffect(() => {
    const saved = siteConfig.theme.allowVisitorSwitch ? localStorage.getItem("theme-mode") : null;
    if (saved) setMode(saved);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    if (siteConfig.theme.allowVisitorSwitch) localStorage.setItem("theme-mode", mode);
  }, [mode]);
  return <Ctx.Provider value={{ mode, setMode, allowSwitch: siteConfig.theme.allowVisitorSwitch }}>{children}</Ctx.Provider>;
}
