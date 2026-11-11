export interface SearchTariffResult {
  code?: unknown;
  name?: unknown;
  category?: unknown;
  amount?: unknown;
  is_active?: unknown;
}

function normalizeTariffName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findExactActiveTariffMatch(code: string, results: SearchTariffResult[]) {
  const expectedCode = code.trim().toUpperCase();
  const matches = results.filter((result) =>
    result.is_active === true && String(result.code || "").trim().toUpperCase() === expectedCode
  );
  return matches.length === 1 ? matches[0] : null;
}

export function findExactActiveTariffNameMatch(
  name: string,
  category: string | null | undefined,
  results: SearchTariffResult[],
) {
  const expectedName = normalizeTariffName(name);
  if (!expectedName) return null;
  const expectedCategory = String(category || "").trim().toLowerCase();
  const matches = results.filter((result) =>
    result.is_active === true &&
    normalizeTariffName(String(result.name || "")) === expectedName &&
    (!expectedCategory || String(result.category || "").trim().toLowerCase() === expectedCategory)
  );
  return matches.length === 1 ? matches[0] : null;
}
