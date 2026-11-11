/** Keep user input inside a single PostgREST filter value. */
export function normalizeEnrolleeSearchTerm(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
