"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Retour cohérent : revient à la page précédente réelle (d'où tu viens),
// avec un repli si on arrive directement sur la page (pas d'historique).
export default function BackButton({ fallback = "/", label = "Retour", className = "" }) {
  const router = useRouter();
  const onClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-content ${className}`}>
      <ArrowLeft className="h-4 w-4" />{label}
    </button>
  );
}
