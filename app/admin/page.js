"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminPanels } from "@/lib/modules";

export default function AdminHome() {
  const router = useRouter();
  useEffect(() => { const first = adminPanels()[0]; if (first) router.replace(`/admin/${first.key}`); }, [router]);
  return <p className="text-muted">Redirection…</p>;
}
