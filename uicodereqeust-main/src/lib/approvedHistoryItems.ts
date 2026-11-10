export interface ApprovedHistoryItem {
  name: string;
  code: string | null;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  frequency: string | null;
  duration: string | null;
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return !text || /^(null|undefined|nil|none|n\/?a)$/i.test(text) ? null : text;
}

function isDeclined(value: unknown): boolean {
  return value === true || value === 1 || (typeof value === "string" && /^(true|yes|1)$/i.test(value.trim()));
}

/** Parse only persisted approval line items. Missing quantities stay unknown. */
export function getApprovedHistoryItems(value: unknown): ApprovedHistoryItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object" || isDeclined((rawItem as Record<string, unknown>).declined)) {
      return [];
    }

    const item = rawItem as Record<string, unknown>;
    const name = nonEmptyText(item.name) ?? nonEmptyText(item.description) ?? nonEmptyText(item.code);
    if (!name) return [];

    const rawQuantity = item.approved_quantity ?? item.quantity;
    const parsedQuantity = typeof rawQuantity === "number" || typeof rawQuantity === "string"
      ? Number(rawQuantity)
      : Number.NaN;

    return [{
      name,
      code: nonEmptyText(item.code),
      category: nonEmptyText(item.category),
      quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : null,
      unit: nonEmptyText(item.unit) ?? nonEmptyText(item.quantity_unit),
      frequency: nonEmptyText(item.frequency),
      duration: nonEmptyText(item.duration),
    }];
  });
}
