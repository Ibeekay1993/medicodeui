export type Hospital = {
  id: string;
  name: string;
  code?: string;
  user_id?: string;
  email?: string;
  [key: string]: any;
};

export type HospitalDashboardMetrics = {
  approvedCount: number;
  pendingCount: number;
  deniedCount: number;
  totalValue: number;
  pendingPayout: number;
  paidClaims: number;
};

export type AuthorizationRequest = {
  id: string;
  patient_name: string;
  policy_number: string;
  authorization_code?: string;
  status: string;
  total_amount?: number;
  created_at: string;
  hospital_id?: string;
  requesting_hospital_id?: string;
  referring_hospital_id?: string;
  referred_hospital_id?: string;
  claiming_hospital_id?: string;
  deletion_status?: string;
  [key: string]: any;
};

export type HospitalClaim = {
  id: string;
  request_id?: string;
  status: string;
  total_amount?: number;
  approved_amount?: number;
  contest_deadline?: string;
  [key: string]: any;
};
