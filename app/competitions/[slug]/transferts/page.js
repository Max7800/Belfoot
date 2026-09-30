"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { resolveCompetitionRoute, competitionPath } from "@/lib/competitionRoutes";
import CompetitionTransfers from "@/components/football/CompetitionTransfers";

export default function CompetitionTransfersPage() {
  const { slug } = useParams();
  const [comp, setComp] = useState(undefined);

  useEffect(() => {
    supabase.from("competitions").select("*").then(({ data }) => setComp(resolveCompetitionRoute(data || [], slug) || null));
  }, [slug]);

  if (comp === undefined) return <p className="py-8 text-center text-sm text-muted">Chargement…</p>;
  if (!comp) return <p className="py-8 text-center text-sm text-muted">Compétition introuvable.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={competitionPath(comp)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-content"><ArrowLeft className="h-4 w-4" />{comp.name}</Link>
      <h1 className="text-2xl font-black">Transferts · {comp.name}</h1>
      <CompetitionTransfers competition={comp} />
    </div>
  );
}
