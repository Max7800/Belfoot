"use client";
import { useAuth } from "@/lib/auth";

// Indication technique (synchronisation, administration…) affichée seulement à
// un administrateur connecté : les visiteurs ne voient que le texte neutre.
export default function AdminHint({ children, className = "" }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return null;
  return <span className={`mt-1 block text-[11px] text-amber-200/80 ${className}`}>Admin : {children}</span>;
}
