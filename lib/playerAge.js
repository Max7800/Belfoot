export function playerAge(player, now = new Date()) {
  const match = String(player?.birth_date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const birthYear = Number(match[1]);
    const birthMonth = Number(match[2]);
    const birthDay = Number(match[3]);
    let age = now.getFullYear() - birthYear;
    if (now.getMonth() + 1 < birthMonth || (now.getMonth() + 1 === birthMonth && now.getDate() < birthDay)) age--;
    if (age >= 0 && age < 100) return age;
  }
  const fallback = Number(player?.age);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}
