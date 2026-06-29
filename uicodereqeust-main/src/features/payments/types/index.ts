export interface PaymentBatch {
  id: string;
  batch_reference: string;
  provider_id: string;
  month: string;
  total_claims: number;
  total_amount: number;
  status: "draft" | "ready" | "paid" | "rejected";
  created_at: string;
  paid_at?: string | null;
  evidence_url?: string | null;
  hospitals?: { name: string } | null;
}

export interface AwaitingPaymentClaim {
  id: string;
  claim_number: string;
  patient_name: string;
  policy_number: string;
  hospital_name: string;
  hospital_id: string;
  total_amount: number;
  approved_amount: number;
  approved_at: string;
  created_at: string;
  status: string;
  payment_status: string;
  contest_deadline?: string | null;
}

export interface PaidClaim {
  id: string;
  claim_number: string;
  patient_name: string;
  policy_number: string;
  hospital_name: string;
  hospital_id: string;
  total_amount: number;
  approved_amount: number;
  approved_at: string;
  status: string;
  payment_status: string;
}

export interface FinanceReportStats {
  totalPaidAmount: number;
  totalPaidClaims: number;
  totalAwaitingAmount: number;
  totalAwaitingClaims: number;
}
