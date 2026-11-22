import CompetitionTransfers from "@/components/football/CompetitionTransfers";

// Page de démonstration isolée ; ne doit pas être fusionnée dans le site public.
export default function ApercuMercato() {
  const competition = { id: "demo-pro", name: "Jupiler Pro League", provider: "apifootball", external_id: "144", ext: { season: "2026-2027" } };
  return <main className="mx-auto max-w-6xl"><h1 className="mb-4 text-2xl font-black">Mercato de démonstration</h1><CompetitionTransfers competition={competition} /></main>;
}
