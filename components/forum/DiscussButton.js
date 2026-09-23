"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { getRefTopic, startRefTopic } from "@/lib/forum";
import { useAuth } from "@/lib/auth";

// Bouton « Discuter » réutilisable : ouvre le sujet lié à l'entité, ou le crée.
// Ex. <DiscussButton refType="match" refId={id} title="Discussion : A - B" label="Discuter de ce match" />
export default function DiscussButton({ refType, refId, title, label = "Discuter", categorySlug }) {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const router = useRouter();
  const [topicId, setTopicId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => { setTopicId(await getRefTopic(refType, refId)); setLoading(false); })();
  }, [refType, refId]);

  const go = async () => {
    if (topicId) { router.push(`/forum/${topicId}`); return; }
    if (!userId) { router.push("/login"); return; }
    setBusy(true);
    try {
      const id = await startRefTopic({ refType, refId, title, userId, categorySlug, firstMessage: "Discussion ouverte." });
      router.push(`/forum/${id}`);
    } catch { setBusy(false); }
  };

  if (loading || !refId) return null;
  return (
    <button onClick={go} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-sm font-bold text-accent transition hover:bg-accent/10 disabled:opacity-50">
      <MessagesSquare className="h-4 w-4" />{topicId ? "Voir la discussion" : label}
    </button>
  );
}
