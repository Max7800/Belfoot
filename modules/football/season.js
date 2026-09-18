export function seasonYear(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? match[0] : String(new Date().getFullYear());
}

export function seasonLabel(value) {
  const text = String(value || "").trim();
  const years = text.match(/\d{4}/g) || [];
  const start = Number(years[0] || new Date().getFullYear());
  const end = Number(years[1] || start + 1);
  return `${start}-${end}`;
}

export async function ensureSeason(db, competitionId, value) {
  const label = seasonLabel(value);
  const { data: existing, error: selectError } = await db.from("seasons")
    .select("id,label")
    .eq("competition_id", competitionId)
    .eq("label", label)
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;

  const { data: created, error: insertError } = await db.from("seasons")
    .insert({ competition_id: competitionId, label })
    .select("id,label")
    .single();
  if (insertError?.code === "23505") {
    const { data: concurrent, error: concurrentError } = await db.from("seasons")
      .select("id,label")
      .eq("competition_id", competitionId)
      .eq("label", label)
      .limit(1)
      .single();
    if (concurrentError) throw concurrentError;
    return concurrent;
  }
  if (insertError) throw insertError;
  return created;
}
