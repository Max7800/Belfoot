"use client";
import { useParams } from "next/navigation";
import { panelComponent } from "@/components/admin/registry";

export default function AdminPanel() {
  const { key } = useParams();
  const found = panelComponent(key);
  if (!found) return <p className="text-muted">Panneau inconnu.</p>;
  const { Comp, props } = found;
  return <Comp {...props} />;
}
