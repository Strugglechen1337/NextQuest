/** Vereinheitlicht Titel, damit dasselbe Spiel aus verschiedenen Stores zusammenfindet. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[™®©]/g, "")
    .replace(/\((pc|windows|windows 10|xbox series x\|s|xbox one)\)/g, "")
    .replace(
      /\b(game of the year|goty|definitive|deluxe|complete|ultimate|standard|gold|digital|enhanced|director'?s cut|anniversary|premium)( edition)?\b/g,
      "",
    )
    .replace(/\b(edition|for windows( 10)?|windows edition|pc edition)\b/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
