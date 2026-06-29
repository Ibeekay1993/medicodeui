export type ClaimRecord = {
  id: string;
  hospital_id: string | null;
  hospital_name: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
};

export type HospitalClaimSummary = {
  key: string;
  name: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  contested: number;
  other: number;
  value: number;
  approvedValue: number;
  contestedValue: number;
  latest: string;
};

export type ClaimDraft = {
  id: string;
  claim_number?: string | null;
  auth_code?: string | null;
  policy_number?: string | null;
  patient_name?: string | null;
  hospital_id?: string | null;
  hospital_name?: string | null;
  status?: string | null;
  total_amount?: number | null;
  created_at?: string;
  notes?: string | null;
  [key: string]: any;
};

export type AuditDecision = {
  status: "approved" | "declined" | "adjusted";
  approvedQuantity?: number;
  approvedUnitPrice?: number;
  reason?: string;
  reasonCategory?: string;
  note?: string;
  aiExplanation?: string;
};

export type VerificationData = {
  exists: boolean;
  authRequest: any | null;
  approvedItems: any[];
  loading: boolean;
  mismatchReasons: string[];
};

export type ClaimsAnalysisResult = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  contested: number;
  other: number;
  totalValue: number;
  approvedValue: number;
  rejectedValue: number;
  contestedValue: number;
  hospitals: HospitalClaimSummary[];
  volume: [string, number][];
};
