// Façade commune des synchronisations lancées depuis l'interface
// d'administration (panneau Jobs, fiches club, joueur et compétition) :
// toujours préflight → blocages → confirmation → lancement, avec le même
// texte de coût et les mêmes erreurs. Le contrôle reste côté serveur (runJob
// refait le préflight et trace chaque exécution dans job_runs) ; ce module
// évite seulement qu'un bouton saute une étape ou lise mal une réponse.

async function sessionToken() {
  const { supabase } = await import("@/lib/supabaseClient");
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || "";
}

// Les routes admin répondent en JSON, ou en texte brut en cas d'erreur.
export async function adminRequest(path, payload, { getToken = sessionToken, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!response.ok) throw new Error(data?.detail || data?.error || text || `HTTP ${response.status}`);
  return data ?? { detail: text };
}

export function preflightSummary(result) {
  const lines = (result.steps || []).map((step, index) => `${index + 1}. ${step.label} : ${step.min === step.max ? step.max : `${step.min}–${step.max}`} appel(s) — ${step.basis}`);
  const quota = result.quotaRemaining == null ? "quota inconnu" : `dernier quota connu ${result.quotaRemaining}`;
  const warnings = result.warnings?.length ? `\nAVERTISSEMENTS :\n- ${result.warnings.join("\n- ")}` : "";
  const blockers = result.blockers?.length ? `\nBLOCAGES :\n- ${result.blockers.join("\n- ")}` : "\n✓ Préflight validé.";
  return `Cible : ${result.target} · saison ${result.season || "auto"}\n${lines.join("\n")}\nTOTAL : ${result.total.min}–${result.total.max} appel(s) · budget ${result.budget} · ${quota}${warnings}${blockers}`;
}

// Texte court des fiches : question, précision éventuelle, coût et avertissements.
export function confirmationText(question, preflight, detail = "") {
  const warnings = preflight.warnings?.length ? `\n\nAvertissements :\n- ${preflight.warnings.join("\n- ")}` : "";
  return `${question}${detail ? `\n\n${detail}` : ""}\n\nCoût maximal estimé : ${preflight.total?.max ?? "?"} appel(s) API (budget ${preflight.budget ?? "?"}).${warnings}`;
}

export class JobBlockedError extends Error {
  constructor(preflight) {
    super((preflight.blockers || []).join(" · ") || "Synchronisation bloquée par le préflight.");
    this.name = "JobBlockedError";
    this.preflight = preflight;
  }
}

// `confirm(preflight)` : true pour lancer ; null = pas de confirmation (lot déjà
// confirmé, ex. joueur par joueur). Retourne { cancelled: true } si refusé.
export async function launchJob(payload, { confirm, onStatus = () => {}, ...request } = {}) {
  if (confirm === undefined) throw new Error("launchJob : confirmation obligatoire (ou null pour un lot déjà confirmé).");
  onStatus("Calcul du coût de la synchronisation…");
  const preflight = await adminRequest("/api/admin/job-preflight", payload, request);
  if (!preflight.ok) throw new JobBlockedError(preflight);
  if (confirm && !(await confirm(preflight))) { onStatus(""); return { cancelled: true, preflight }; }
  onStatus("Synchronisation en cours…");
  const result = await adminRequest("/api/admin/run-job", payload, request);
  return { cancelled: false, preflight, result };
}
