// Parser for the visible rich-text section of FIFA's 2026 round-of-32 article.
// The HTML shell returned by a plain request does not contain this section.
const participants = new Set([
  "Croatia", "Uruguay", "Italy", "Tajikistan", "Brazil", "Mozambique", "Belgium", "Saudi Arabia",
  "Republic of Ireland", "Côte d'Ivoire", "Mexico", "Argentina", "Chile", "Morocco", "Spain", "Uzbekistan",
  "Australia", "Senegal", "Mali", "Dominican Republic", "Korea Republic", "Japan", "Serbia", "China PR",
  "Greece", "Ecuador", "Egypt", "Colombia", "France", "Uganda", "Venezuela", "Algeria",
]);
const clean = (text) => text.replace(/<[^>]*>/g, " ").replace(/&#0*39;|&apos;/gi, "'").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();

export function parseFifaU17RoundOf32(html) {
  if (typeof html !== "string" || !/Round of 32 match-ups confirmed at U-17 World Cup/i.test(html) || !/FIFA U-17 World Cup Qatar 2026/i.test(html)) throw new Error("Article FIFA ou édition non reconnus");
  const dates = [["Monday, 30 November", "2026-11-30"], ["Tuesday, 1 December", "2026-12-01"]];
  const fixtures = [];
  for (const [heading, date] of dates) {
    const blocks = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi)].filter((match) => clean(match[1]).includes(heading));
    if (blocks.length !== 1) throw new Error(`Date FIFA absente ou ambiguë : ${heading}`);
    const rows = blocks[0][2].split(/<br\s*\/?\s*>/i);
    if (rows.length !== 8) throw new Error(`Nombre de matchs FIFA invalide : ${heading}`);
    for (const row of rows) {
      const parsed = clean(row).match(/^(.+?)\s+v\s+(.+?)\s*,\s*(\d{2}):(\d{2})\s*,/i);
      if (!parsed) throw new Error("Match FIFA illisible");
      const [, home, away, hours, minutes] = parsed;
      if (!participants.has(home) || !participants.has(away) || +hours > 23 || +minutes > 59) throw new Error("Équipe ou heure FIFA inconnue");
      fixtures.push({ home, away, kickoff: new Date(`${date}T${hours}:${minutes}:00+03:00`).toISOString() });
    }
  }
  const teams = fixtures.flatMap((match) => [match.home, match.away]);
  if (fixtures.length !== 16 || new Set(teams).size !== 32) throw new Error("Tableau FIFA incomplet ou équipes en double");
  return fixtures;
}
