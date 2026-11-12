/** Quote an untrusted value embedded inside a PostgREST logical filter. */
export function quotePostgrestFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Escape SQL LIKE wildcards when a value is passed through a typed filter builder. */
export function escapeLikePatternLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
