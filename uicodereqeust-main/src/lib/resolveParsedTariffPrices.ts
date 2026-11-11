import {
  parseNonNegativeAmount,
  parsePositiveQuantity,
  type TariffOption,
} from "@/lib/clinicalUtils";

export interface ActiveTariffPrice {
  code: string | null;
  name: string | null;
  category: string | null;
  amount: unknown;
}

/**
 * Replace parser-provided prices with the active NHIA catalogue amount.
 * Parser output is a candidate match; only the active catalogue is authoritative
 * for approval pricing. Duplicate codes are treated as ambiguous and blocked.
 */
export function resolveParsedTariffPrices(
  items: TariffOption[],
  activeTariffs: ActiveTariffPrice[],
): TariffOption[] {
  const byCode = new Map<string, ActiveTariffPrice[]>();
  for (const tariff of activeTariffs) {
    const code = String(tariff.code || "").trim().toUpperCase();
    if (!code) continue;
    const rows = byCode.get(code) || [];
    rows.push(tariff);
    byCode.set(code, rows);
  }

  return items.map((item) => {
    const code = String(item.code || "").trim().toUpperCase();
    const rows = code ? byCode.get(code) || [] : [];
    const quantity = parsePositiveQuantity(item.quantity);
    const tariff = rows.length === 1 ? rows[0] : null;
    const unitPrice = tariff ? parseNonNegativeAmount(tariff.amount) : null;

    if (!tariff || unitPrice === null) {
      // Do not retain a parser's guessed or stale total when its catalogue row
      // is missing, inactive, ambiguous, or has no valid amount.
      return {
        ...item,
        unitPrice: 0,
        price: 0,
        priceNeedsReview: true,
      };
    }

    const total = quantity === null ? 0 : unitPrice * quantity;
    return {
      ...item,
      name: tariff.name || item.name,
      category: tariff.category || item.category,
      unitPrice,
      price: Math.round((total + Number.EPSILON) * 100) / 100,
      priceNeedsReview: false,
    };
  });
}
