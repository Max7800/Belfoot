"use client";
import { useParams } from "next/navigation";
import { getCollection } from "@/config/collections";
import ContributeForm from "@/components/ContributeForm";

// /proposer/<clé de collection> — ouvert seulement si la collection a `contribute: true`.
export default function ProposePage() {
  const { collection } = useParams();
  const col = getCollection(collection);
  if (!col || !col.contribute) return <p className="text-muted">Les contributions ne sont pas ouvertes ici.</p>;
  return <ContributeForm collectionKey={collection} />;
}
