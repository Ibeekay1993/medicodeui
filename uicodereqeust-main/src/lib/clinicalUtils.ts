export type TariffOption = {
  code: string | null;
  name: string;
  category: string | null;
  price: number;
  unitPrice?: number;
  quantity?: number;
  frequency?: string | null;
  duration?: string | null;
  matched_via?: string;
  matched_text?: string;
  confidence?: string;
  original_text?: string;
  declined?: boolean;
  decline_reason?: string | null;
};

export function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function itemUnitPrice(item: TariffOption) {
  return Number(item.unitPrice ?? item.price ?? 0);
}

export function itemQuantity(item: TariffOption) {
  const quantity = Number(item.quantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

export function itemTotal(item: TariffOption) {
  if (item.declined) return 0;
  return itemUnitPrice(item) * itemQuantity(item);
}

export function cleanPatientName(name: string) {
  if (!name) return "";
  return name
    .split(/diagnosis/i)[0]
    .replace(/[:\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanDiagnosisText(diagnosis: string, patientName: string) {
  const raw = String(diagnosis || "").trim();
  if (!raw) return "";

  const normalized = raw.replace(/^diagnosis[:\s-]*/i, "").trim();
  const name = cleanPatientName(patientName);
  if (name && normalized.toLowerCase().startsWith(name.toLowerCase())) {
    return normalized.slice(name.length).replace(/^[:\-\s]+/, "").trim() || normalized;
  }
  return normalized;
}

export function normalizePolicyNumber(value: unknown) {
  return String(value ?? "")
    .replace(/[^\dA-Za-z]/g, "")
    .replace(/\.0+$/, "")
    .trim();
}

export function normalizePolicyRoot(value: unknown) {
  const raw = String(value ?? "").trim();
  const base = raw.replace(/[-_]\d+$/, "");
  return normalizePolicyNumber(base);
}

export function recordMatchesPolicy(record: any, policy: string) {
  const recordRawPolicy = String(record?.policy_number || record?.nhis_no || record?.plan_code || "");
  const recordPolicy = normalizePolicyNumber(recordRawPolicy);
  const normalizedPolicy = normalizePolicyNumber(policy);
  const recordRoot = normalizePolicyRoot(recordRawPolicy);
  const policyRoot = normalizePolicyRoot(policy);

  if (!recordPolicy || !normalizedPolicy) return false;
  if (recordPolicy === normalizedPolicy) return true;
  if (recordRoot && policyRoot && recordRoot === policyRoot) return true;
  return recordPolicy.startsWith(normalizedPolicy) || normalizedPolicy.startsWith(recordPolicy);
}

export function recordMatchesHistory(record: any, policy: string) {
  return policy ? recordMatchesPolicy(record, policy) : false;
}

export function canDeleteRequestRecord(record: any) {
  const status = String(record?.status || "").toLowerCase().trim();
  return status === "pending";
}

export function getInitials(nameOrEmail?: string | null) {
  const raw = String(nameOrEmail || "").trim();
  const source = raw.includes("@") ? raw.split("@")[0].replace(/[._-]+/g, " ") : raw;
  const parts = source
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "AG";
}
