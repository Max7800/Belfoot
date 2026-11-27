// Le coefficient est saisi manuellement : ne pas deviner une décimale perdue.
export function uefaPointsDisplay(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { text: "", valid: true };
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) return { text: "Valeur à vérifier", valid: false };
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number) || number >= 1000) return { text: "Valeur à vérifier", valid: false };
  return { text: value, valid: true };
}
