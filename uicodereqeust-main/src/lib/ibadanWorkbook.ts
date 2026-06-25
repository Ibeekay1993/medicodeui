import { supabase } from "@/integrations/supabase/client";

export type IbadanWorkbookRecord = {
  id: string;
  request_id: string;
  date: string;
  created_at: string;
  updated_at: string;
  decided_at: string;
  hospital_name: string;
  patient_name: string;
  policy_number: string;
  authorization_code: string;
  diagnosis: string;
  treatment: string;
  requesting_officer: string;
  note: string;
  status: string;
  source: string;
};

let cachedPromise: Promise<IbadanWorkbookRecord[]> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30 * 1000;

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\r/g, "");

const normalizePolicy = (value: unknown) => normalizeText(value).replace(/\s+/g, "");
const normalizePolicyRoot = (value: unknown) =>
  normalizePolicy(String(value ?? "").replace(/[-_]\d+$/, ""));

const normalizeMatchText = (value: unknown) =>
  normalizeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeStatus = (value: unknown, authorizationCode?: unknown) => {
  const status = normalizeText(value).toLowerCase();
  const code = normalizeText(authorizationCode).toLowerCase();
  const hasCode = Boolean(code) && !["-", "pending", "null", "undefined", "none"].includes(code);

  if (status.includes("declin") || status.includes("reject")) return "rejected";
  if (status.includes("defer")) return "deferred";
  if (hasCode) return "approved";
  if (status.includes("code received") || status === "received" || status.includes("received") || status.includes("approved")) return "approved";
  if (status.includes("pending")) return "pending";
  return status || "pending";
};

const buildRequestId = (row: Partial<IbadanWorkbookRecord>) =>
  [
    "auth",
    normalizePolicy(row.policy_number),
    normalizeText(row.date || ""),
    normalizeText(row.patient_name || ""),
    normalizeText(row.hospital_name || ""),
    normalizeText(row.diagnosis || ""),
    normalizeText(row.treatment || ""),
  ]
    .filter(Boolean)
    .join(":");

const isHeaderLikeRow = (row: {
  date: string;
  patient_name: string;
  policy_number: string;
  authorization_code: string;
  diagnosis: string;
  treatment: string;
  status: string;
}) => {
  const joined = [
    row.date,
    row.patient_name,
    row.policy_number,
    row.authorization_code,
    row.diagnosis,
    row.treatment,
    row.status,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .join(" ");

  return (
    joined.includes("date") &&
    (joined.includes("patient name") || joined.includes("enrollee name") || joined.includes("enrolle name")) &&
    joined.includes("nhis/id") &&
    (joined.includes("diagnosis") || joined.includes("service")) &&
    joined.includes("status")
  );
};

function mapAuthorizationRow(row: any): IbadanWorkbookRecord {
  const date = normalizeText(row?.date || row?.created_at || "");
  const patient_name = normalizeText(row?.patient_name || row?.enrollee_name || "");
  const policy_number = normalizePolicy(row?.policy_number || "");
  const authorization_code = normalizeText(row?.authorization_code || row?.code || row?.pre_authorisation_code || "");
  const diagnosis = normalizeText(row?.diagnosis || row?.diagnosis_services || "");
  const treatment = normalizeText(row?.treatment || row?.diagnosis_services || "");
  const note = normalizeText(row?.note || row?.decision_reason || row?.clinical_notes || "");
  const status = normalizeStatus(row?.status || "", authorization_code);
  const hospital_name = normalizeText(row?.hospital_name || row?.provider || "");
  const requesting_officer = normalizeText(row?.requesting_officer || row?.submitted_by || row?.decided_by || "");
  const created_at = normalizeText(row?.created_at || "");
  const updated_at = normalizeText(row?.updated_at || created_at);
  const decided_at = normalizeText(row?.decided_at || created_at);
  const request_id = normalizeText(row?.request_id || row?.id || buildRequestId({ date, patient_name, policy_number, authorization_code }));

  return {
    id: normalizeText(row?.id || request_id),
    request_id,
    date,
    created_at,
    updated_at,
    decided_at,
    hospital_name,
    patient_name,
    policy_number,
    authorization_code,
    diagnosis,
    treatment,
    requesting_officer,
    note,
    status,
    source: normalizeText(row?.source || "authorization_requests"),
  };
}

async function loadAuthorizationRowsAll() {
  const pageSize = 1000;
  let from = 0;
  const allRows: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("authorization_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

export async function loadIbadanWorkbookHistory(policyFilter?: string) {
  if (policyFilter) {
    try {
      const policy = normalizePolicy(policyFilter);
      const policyRoot = normalizePolicyRoot(policy);

      let query = supabase
        .from("authorization_requests")
        .select("*");

      if (policyRoot) {
        query = query.or(`policy_number.eq.${policy},policy_number.ilike.${policyRoot}%`);
      } else {
        query = query.eq("policy_number", policy);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      return (data || [])
        .map(mapAuthorizationRow)
        .filter((record) => !isHeaderLikeRow(record));
    } catch (error) {
      console.error("Failed to load workbook history for policy:", error);
      return [];
    }
  }

  if (cachedPromise && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPromise;
  }

  cachedPromise = (async () => {
    const rows = await loadAuthorizationRowsAll();
    return rows.map(mapAuthorizationRow).filter((record) => !isHeaderLikeRow(record));
  })().catch((error) => {
    cachedPromise = null;
    cachedAt = 0;
    throw error;
  });
  cachedAt = Date.now();
  return cachedPromise;
}

export function normalizeWorkbookStatus(value: unknown, authorizationCode?: unknown) {
  return normalizeStatus(value, authorizationCode);
}

export function resetIbadanWorkbookHistoryCache() {
  cachedPromise = null;
  cachedAt = 0;
}

export type IbadanWorkbookIndex = {
  rows: IbadanWorkbookRecord[];
  byRequestId: Map<string, IbadanWorkbookRecord[]>;
  byPolicyNumber: Map<string, IbadanWorkbookRecord[]>;
  byPolicyRoot: Map<string, IbadanWorkbookRecord[]>;
  byAuthCode: Map<string, IbadanWorkbookRecord[]>;
  byPatientName: Map<string, IbadanWorkbookRecord[]>;
};

function pushIndexValue(map: Map<string, IbadanWorkbookRecord[]>, key: string, row: IbadanWorkbookRecord) {
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    existing.push(row);
    return;
  }
  map.set(key, [row]);
}

export function buildIbadanWorkbookIndex(rows: IbadanWorkbookRecord[]): IbadanWorkbookIndex {
  const index: IbadanWorkbookIndex = {
    rows,
    byRequestId: new Map(),
    byPolicyNumber: new Map(),
    byPolicyRoot: new Map(),
    byAuthCode: new Map(),
    byPatientName: new Map(),
  };

  for (const row of rows) {
    pushIndexValue(index.byRequestId, normalizeText(row.request_id || row.id), row);
    pushIndexValue(index.byPolicyNumber, normalizePolicy(row.policy_number), row);
    pushIndexValue(index.byPolicyRoot, normalizePolicyRoot(row.policy_number), row);
    pushIndexValue(index.byAuthCode, normalizeText(row.authorization_code).replace(/\s+/g, ""), row);
    pushIndexValue(index.byPatientName, normalizeMatchText(row.patient_name), row);
  }

  return index;
}

function pickFirstMatch(rows: IbadanWorkbookRecord[] | undefined) {
  return rows?.[0] ?? null;
}

export function findIbadanWorkbookMatch(
  index: IbadanWorkbookIndex,
  request: Partial<Pick<IbadanWorkbookRecord, "id" | "request_id" | "patient_name" | "policy_number" | "authorization_code">>,
) {
  const requestId = normalizeText(request.request_id || request.id);
  const policy = normalizePolicy(request.policy_number);
  const policyRoot = normalizePolicyRoot(request.policy_number);
  const authCode = normalizeText(request.authorization_code).replace(/\s+/g, "");
  const patientName = normalizeMatchText(request.patient_name);

  const exactBuckets = [
    index.byRequestId.get(requestId),
    index.byAuthCode.get(authCode),
    index.byPolicyNumber.get(policy),
    index.byPolicyRoot.get(policyRoot),
    index.byPatientName.get(patientName),
  ];

  for (const bucket of exactBuckets) {
    const match = pickFirstMatch(bucket);
    if (match) return match;
  }

  const fallback = index.rows.find((row) => {
    const rowPolicy = normalizePolicy(row.policy_number);
    const rowPolicyRoot = normalizePolicyRoot(row.policy_number);
    const rowAuth = normalizeText(row.authorization_code).replace(/\s+/g, "");
    const rowName = normalizeMatchText(row.patient_name);

    const policyMatch =
      !!policy &&
      (rowPolicy === policy ||
        rowPolicyRoot === policyRoot ||
        rowPolicy.startsWith(policy) ||
        policy.startsWith(rowPolicy));

    const authMatch = !!authCode && !!rowAuth && rowAuth === authCode;
    const nameMatch =
      !!patientName &&
      (rowName.includes(patientName) || patientName.includes(rowName));

    return policyMatch || authMatch || nameMatch;
  });

  return fallback ?? null;
}
