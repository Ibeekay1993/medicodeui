import { describe, it, expect } from "vitest";
import { quotePostgrestFilterValue, escapeLikePattern, safeIlikePattern } from "./postgrestFilter";

describe("PostgREST Filter Security", () => {
  it("quotes values containing commas and special characters", () => {
    const input = "Smith, John";
    expect(quotePostgrestFilterValue(input)).toBe('"Smith, John"');
  });

  it("escapes backslashes and double quotes to prevent injection", () => {
    const malicious = 'bad"value\\test';
    expect(quotePostgrestFilterValue(malicious)).toBe('"bad\\"value\\\\test"');
  });

  it("escapes SQL LIKE wildcards", () => {
    const term = "50% off_sale";
    expect(escapeLikePattern(term)).toBe("50\\% off\\_sale");
  });

  it("escapes backslashes in LIKE patterns", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("constructs safe quoted ilike patterns that preserve commas without splitting filters", () => {
    const term = "Lagos, Nigeria";
    const pattern = safeIlikePattern(term);
    // No LIKE wildcards in input, so only PostgREST double-quote wrapping
    expect(pattern).toBe('"%Lagos, Nigeria%"');
  });

  it("escapes % and _ in ilike patterns so they match literally", () => {
    const term = "50% off_sale";
    const pattern = safeIlikePattern(term);
    // escapeLikePattern produces 50\% off\_sale
    // PostgREST quoting doubles the backslashes: 50\\% off\\_sale
    expect(pattern).toBe('"%50\\\\% off\\\\_sale%"');
  });

  it("escapes backslashes in ilike patterns", () => {
    const pattern = safeIlikePattern("path\\to");
    // escapeLikePattern: path\\to  (1 backslash → 2)
    // PostgREST quoting doubles each: path\\\\to  (2 → 4)
    expect(pattern).toBe('"%path\\\\\\\\to%"');
  });

  it("escapes double quotes in ilike patterns", () => {
    const pattern = safeIlikePattern('say "hello"');
    // No LIKE wildcards. PostgREST quoting escapes ": say \"hello\"
    expect(pattern).toBe('"%say \\"hello\\"%"');
  });

  it("handles empty and null-ish input gracefully", () => {
    // Empty input still wraps with %…% and quotes — matches everything (harmless)
    expect(safeIlikePattern("")).toBe('"%%"');
    // @ts-expect-error — testing runtime null
    expect(safeIlikePattern(null)).toBe('"%%"');
    // @ts-expect-error — testing runtime undefined
    expect(safeIlikePattern(undefined)).toBe('"%%"');
  });
});
