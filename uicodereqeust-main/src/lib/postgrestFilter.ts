/**
 * Security Helper: PostgREST Filter Injection Prevention
 *
 * In PostgREST, logical operators such as `.or()` take comma-separated filter clauses.
 * If user input containing commas (,), parentheses, or quotes is concatenated directly into
 * the filter string without PostgREST double-quoting, the query parser treats those
 * characters as structural syntax. This can cause unexpected query logic expansion
 * or HTTP 400 Bad Request query parse errors.
 *
 * Double-quoting values in PostgREST ensures delimiters are parsed strictly as string literals.
 */

/**
 * Quote an untrusted value embedded inside a PostgREST logical filter.
 */
export function quotePostgrestFilterValue(value: string): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Escape SQL LIKE / ILIKE wildcard characters (% and _) so user input matches literally.
 */
export function escapeLikePattern(value: string): string {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

/**
 * Creates a safe, quoted wildcard pattern suitable for PostgREST `.ilike.<pattern>` filters.
 *
 * Pipeline:
 *  1. escapeLikePattern — backslash-escapes %, _, and \ so user input matches literally.
 *  2. PostgREST double-quote escaping — backslash-escapes \ and " for the PostgREST
 *     quoted-string parser (which reverses them before forwarding to the database).
 *  3. Wrap the result in %…% for substring matching, inside PostgREST double-quotes.
 *
 * e.g. safeIlikePattern("50% off_sale") => '"%50\\% off\\_sale%"'
 */
export function safeIlikePattern(value: string): string {
  // Step 1: escape LIKE wildcards (%, _, \) so they match literally in the DB
  const likeEscaped = escapeLikePattern(String(value ?? ""));
  // Step 2: escape \ and " for the PostgREST double-quote parser
  const quoted = likeEscaped.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  // Step 3: wrap with % wildcards inside PostgREST double-quotes
  return `"%${quoted}%"`;
}
