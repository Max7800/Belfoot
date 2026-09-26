import { Suspense } from "react";
import NationalTeamDirectory from "@/components/football/NationalTeamDirectory";

export default function NationalTeamMatchesPage() {
  return <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-surface" />}><NationalTeamDirectory mode="matches" /></Suspense>;
}
