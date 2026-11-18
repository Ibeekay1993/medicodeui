import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { corsHeaders, getServiceClient, validateUser } from "../_shared/auth.ts";
import { getBrevoSender } from "../_shared/brevo.ts";
import { parseReportRecipients } from "../_shared/report-recipients.ts";

interface AuthRequest {
  id: string;
  created_at: string;
  request_id?: string;
  patient_name?: string;
  patient_phone?: string;
  policy_number?: string;
  diagnosis?: string;
  treatment?: string;
  requesting_hospital?: string;
  requesting_hospital_name?: string;
  hospital_name?: string;
  source?: string;
  authorization_code?: string;
  status?: string;
  rejection_reason?: string;
  decision_reason?: string;
  notes?: string;
  total_amount?: number;
  approved_amount?: number;
  approved_tariff_amount?: number;
  approved_items?: unknown[];
  decided_at?: string;
  decided_by?: string;
  approved_by?: string;
  treatment_submitted_at?: string;
  urgency?: string;
}

function constantTimeEqual(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

const ON_TIME_MINUTES = 15;
const WARNING_MINUTES = 30;

function formatCapitalizedStatus(status: unknown): string {
  const s = String(status || "").trim();
  if (!s) return "Pending";
  return s
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function calculateAccurateApprovedAmount(record: AuthRequest): number {
  if (Array.isArray(record.approved_items) && record.approved_items.length > 0) {
    const cents = record.approved_items.reduce((sum: number, item: any) => {
      if (!item || typeof item !== "object" || Boolean(item.declined)) return sum;
      const val = item.amount ?? item.total;
      if (val !== undefined && val !== null && Number.isFinite(Number(val))) {
        return sum + Math.round(Number(val) * 100);
      }
      const unit = Number(item.unit_price ?? item.price ?? 0);
      const qty = Number(item.quantity ?? 1);
      if (Number.isFinite(unit) && unit > 0 && Number.isFinite(qty) && qty > 0) {
        return sum + Math.round(unit * qty * 100);
      }
      return sum;
    }, 0);
    return cents / 100;
  }
  const s = String(record.status || "").toLowerCase();
  const isApproved = ["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"].includes(s);
  if (isApproved) {
    const fallback = record.total_amount ?? record.approved_amount ?? record.approved_tariff_amount ?? 0;
    return Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  }
  return 0;
}

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const cronSecretHeader = req.headers.get("X-Cron-Secret");
    const cronSecretEnv = Deno.env.get("DAILY_REPORT_CRON_SECRET") || "";

    let isAuthorized = false;
    if (cronSecretHeader && cronSecretEnv && constantTimeEqual(cronSecretHeader, cronSecretEnv)) {
      isAuthorized = true;
    } else {
      try {
        await validateUser(req, ["admin"]);
        isAuthorized = true;
      } catch (err: any) {
        console.warn("Unauthorized monthly-report access attempt:", err.message);
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY is not set on the server.");
    }

    const supabaseClient = getServiceClient();

    let forceSend = false;
    let payload: any = null;
    let customMonthStart: string | null = null;
    let customMonthEnd: string | null = null;

    if (req.method === "POST") {
      try {
        payload = await req.json();
        if (payload?.force === true) forceSend = true;
        if (payload?.start_date && payload?.end_date) {
          customMonthStart = payload.start_date;
          customMonthEnd = payload.end_date;
        }
      } catch {
        // empty body
      }
    }

    // Settings from global_policies
    const { data: policyData } = await supabaseClient
      .from("global_policies")
      .select("value")
      .eq("key", "monthly_report_settings")
      .maybeSingle();

    let configuredRecipients: unknown = Deno.env.get("MONTHLY_REPORT_EMAIL") || Deno.env.get("DAILY_REPORT_EMAIL") || [];
    let isEnabled = true;

    if (policyData && policyData.value) {
      const settings = policyData.value as { emails?: unknown; email?: unknown; enabled?: unknown };
      if (Array.isArray(settings.emails)) configuredRecipients = settings.emails;
      else if (typeof settings.email === "string" && settings.email.trim()) configuredRecipients = settings.email;
      if (policyData.value.enabled !== undefined) {
        isEnabled = !!policyData.value.enabled;
      }
    }

    if (payload && Array.isArray(payload.emails)) configuredRecipients = payload.emails;
    else if (payload && (payload.email || payload.recipient_email)) configuredRecipients = String(payload.email || payload.recipient_email);

    const parsedRecipients = parseReportRecipients(configuredRecipients);
    if (parsedRecipients.invalid.length > 0) {
      return new Response(JSON.stringify({ error: `Invalid recipient email: ${parsedRecipients.invalid.join(", ")}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!isEnabled && !forceSend) {
      return new Response(JSON.stringify({ message: "Monthly report automation is disabled. Skipping execution." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (parsedRecipients.recipients.length === 0) {
      return new Response(JSON.stringify({ message: "No recipient email configured for monthly report." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Determine reporting period: default to the full previous calendar month
    let startIso: string;
    let endIso: string;
    let monthLabel: string;

    if (customMonthStart && customMonthEnd) {
      startIso = new Date(customMonthStart).toISOString();
      endIso = new Date(customMonthEnd).toISOString();
      monthLabel = `${new Date(customMonthStart).toLocaleDateString("en-GB")} to ${new Date(customMonthEnd).toLocaleDateString("en-GB")}`;
    } else {
      const now = new Date();
      // First day of current month minus 1 millisecond gives the last second of previous month
      const startOfPreviousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
      const endOfPreviousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
      startIso = startOfPreviousMonth.toISOString();
      endIso = endOfPreviousMonth.toISOString();
      monthLabel = startOfPreviousMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    }

    // Fetch all requests within the target month (paginate safely)
    const allRecords: AuthRequest[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseClient
        .from("authorization_requests")
        .select("*")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (data && data.length > 0) {
        allRecords.push(...(data as AuthRequest[]));
        if (data.length < pageSize) hasMore = false;
        else page += 1;
      } else {
        hasMore = false;
      }
    }

    // SLA & Financial Computations
    const totalVolume = allRecords.length;
    let approvedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;
    let netApprovedValue = 0;

    let onTimeCount = 0;
    let warningCount = 0;
    let breachedCount = 0;
    const durations: number[] = [];

    const hospitalStats: Record<string, { total: number; approved: number; rejected: number; approvedValue: number }> = {};
    const diagnosisStats: Record<string, { count: number; approvedCount: number; approvedValue: number }> = {};

    for (const r of allRecords) {
      const s = String(r.status || "").toLowerCase();
      const hosp = r.requesting_hospital || r.requesting_hospital_name || r.hospital_name || "Unspecified Hospital";
      const diag = (r.diagnosis || "Unspecified Diagnosis").trim();

      if (!hospitalStats[hosp]) hospitalStats[hosp] = { total: 0, approved: 0, rejected: 0, approvedValue: 0 };
      hospitalStats[hosp].total += 1;

      if (!diagnosisStats[diag]) diagnosisStats[diag] = { count: 0, approvedCount: 0, approvedValue: 0 };
      diagnosisStats[diag].count += 1;

      const isApp = ["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"].includes(s);
      const isRej = ["rejected", "referral_rejected", "cancelled", "denied"].includes(s);

      if (isApp) {
        approvedCount += 1;
        const val = calculateAccurateApprovedAmount(r);
        netApprovedValue += val;
        hospitalStats[hosp].approved += 1;
        hospitalStats[hosp].approvedValue += val;
        diagnosisStats[diag].approvedCount += 1;
        diagnosisStats[diag].approvedValue += val;
      } else if (isRej) {
        rejectedCount += 1;
        hospitalStats[hosp].rejected += 1;
      } else {
        pendingCount += 1;
      }

      // SLA calculation
      if (r.decided_at && r.created_at) {
        const start = Date.parse(r.treatment_submitted_at || r.created_at);
        const end = Date.parse(r.decided_at);
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          const mins = Math.round((end - start) / 60000);
          durations.push(mins);
          if (mins <= ON_TIME_MINUTES) onTimeCount += 1;
          else if (mins <= WARNING_MINUTES) warningCount += 1;
          else breachedCount += 1;
        }
      }
    }

    const totalDecided = onTimeCount + warningCount + breachedCount;
    const slaOnTimeRate = totalDecided > 0 ? ((onTimeCount / totalDecided) * 100).toFixed(1) : "0.0";
    const slaBreachRate = totalDecided > 0 ? ((breachedCount / totalDecided) * 100).toFixed(1) : "0.0";

    const sortedDurations = [...durations].sort((a, b) => a - b);
    const medianMinutes = sortedDurations.length > 0
      ? (sortedDurations.length % 2 === 1
          ? sortedDurations[Math.floor(sortedDurations.length / 2)]
          : Math.round((sortedDurations[sortedDurations.length / 2 - 1] + sortedDurations[sortedDurations.length / 2]) / 2))
      : 0;

    const approvalRate = totalVolume > 0 ? ((approvedCount / totalVolume) * 100).toFixed(1) : "0.0";
    const rejectionRate = totalVolume > 0 ? ((rejectedCount / totalVolume) * 100).toFixed(1) : "0.0";

    // Top 5 Hospitals by approved payout value
    const topHospitals = Object.entries(hospitalStats)
      .sort((a, b) => b[1].approvedValue - a[1].approvedValue)
      .slice(0, 5);

    // Top 5 Diagnoses
    const topDiagnoses = Object.entries(diagnosisStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    // Construct Executive HTML Email
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #1e293b; line-height: 1.5; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0F6E56 0%, #0a4d3c 100%); padding: 32px; text-align: center; color: #ffffff;">
          <img src="https://app.ronsbergerhmo.io/ronsberger-logo.png" alt="Ronsberger HMO Logo" width="56" height="56" style="border-radius: 10px; background: rgba(255,255,255,0.15); padding: 6px; object-fit: contain; margin-bottom: 12px;" />
          <h2 style="margin: 0; font-size: 15px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #93c34b;">Ronsberger HMO</h2>
          <h1 style="margin: 4px 0 0 0; font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em;">Executive Monthly Intelligence Report</h1>
          <p style="margin: 6px 0 0 0; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.85); text-transform: uppercase;">Reporting Cycle: <strong>${monthLabel}</strong></p>
        </div>

        <div style="padding: 24px 32px;">
          <p style="font-size: 14px; color: #475569; margin: 0 0 20px 0;">
            Hello Executive Management,<br/>
            Here is your comprehensive monthly audit and performance summary for <strong>${monthLabel}</strong>. All financial metrics reflect strictly verified and vetted approved items.
          </p>

          <!-- Core Metric Cards -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 24px;">
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 16px; border-radius: 10px; text-align: center;">
              <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Total Pre-Auth Volume</span>
              <p style="margin: 6px 0 0 0; font-size: 24px; font-weight: 900; color: #0f172a;">${totalVolume.toLocaleString()}</p>
              <span style="font-size: 11px; color: #64748b;">${approvedCount} Approved (${approvalRate}%)</span>
            </div>
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 16px; border-radius: 10px; text-align: center;">
              <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #047857; letter-spacing: 0.05em;">Net Approved Value</span>
              <p style="margin: 6px 0 0 0; font-size: 22px; font-weight: 900; color: #047857;">₦${netApprovedValue.toLocaleString("en-NG", { maximumFractionDigits: 2 })}</p>
              <span style="font-size: 11px; color: #059669;">Verified Approved Tariff Total</span>
            </div>
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 10px; text-align: center;">
              <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #1d4ed8; letter-spacing: 0.05em;">SLA Compliance (≤15m)</span>
              <p style="margin: 6px 0 0 0; font-size: 24px; font-weight: 900; color: #1d4ed8;">${slaOnTimeRate}%</p>
              <span style="font-size: 11px; color: #2563eb;">Median Response: ${medianMinutes} mins</span>
            </div>
          </div>

          <!-- Operational SLA Scorecard -->
          <h3 style="font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; margin: 28px 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
            Operational SLA Scorecard (Decision Turnaround)
          </h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
            <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px; border-radius: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #166534;">Target Met (≤ 15 mins)</span>
              <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 800; color: #16a34a;">${onTimeCount} <span style="font-size: 12px; font-weight: 500; color: #64748b;">(${slaOnTimeRate}%)</span></p>
            </div>
            <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #92400e;">Warning Window (16 – 30 mins)</span>
              <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 800; color: #d97706;">${warningCount} <span style="font-size: 12px; font-weight: 500; color: #64748b;">(${totalDecided > 0 ? ((warningCount / totalDecided) * 100).toFixed(1) : 0}%)</span></p>
            </div>
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; border-radius: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #991b1b;">SLA Breached (> 30 mins)</span>
              <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 800; color: #dc2626;">${breachedCount} <span style="font-size: 12px; font-weight: 500; color: #64748b;">(${slaBreachRate}%)</span></p>
            </div>
          </div>

          <!-- Top Hospitals Table -->
          <h3 style="font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; margin: 28px 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
            Top 5 Healthcare Providers by Approved Expenditure
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; margin-bottom: 24px;">
            <thead>
              <tr style="background: #f8fafc; color: #475569; text-transform: uppercase; font-size: 10px; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 10px 12px;">Hospital Name</th>
                <th style="padding: 10px 12px; text-align: center;">Total Volume</th>
                <th style="padding: 10px 12px; text-align: center;">Approved</th>
                <th style="padding: 10px 12px; text-align: right;">Net Approved (₦)</th>
              </tr>
            </thead>
            <tbody>
              ${topHospitals.map(([name, stat], idx) => `
                <tr style="border-bottom: 1px solid #f1f5f9; ${idx % 2 === 1 ? 'background: #fcfcfd;' : ''}">
                  <td style="padding: 10px 12px; font-weight: 700; color: #1e293b;">${name}</td>
                  <td style="padding: 10px 12px; text-align: center; color: #64748b;">${stat.total}</td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: 600; color: #059669;">${stat.approved}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: 800; color: #0F6E56;">₦${stat.approvedValue.toLocaleString("en-NG", { maximumFractionDigits: 2 })}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <!-- Top Diagnoses Table -->
          <h3 style="font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; margin: 28px 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
            Top 5 Diagnoses & Treatment Encounters
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; margin-bottom: 24px;">
            <thead>
              <tr style="background: #f8fafc; color: #475569; text-transform: uppercase; font-size: 10px; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 10px 12px;">Diagnosis / Condition</th>
                <th style="padding: 10px 12px; text-align: center;">Patient Encounters</th>
                <th style="padding: 10px 12px; text-align: right;">Net Approved (₦)</th>
              </tr>
            </thead>
            <tbody>
              ${topDiagnoses.map(([diag, stat], idx) => `
                <tr style="border-bottom: 1px solid #f1f5f9; ${idx % 2 === 1 ? 'background: #fcfcfd;' : ''}">
                  <td style="padding: 10px 12px; font-weight: 700; color: #1e293b;">${diag}</td>
                  <td style="padding: 10px 12px; text-align: center; color: #64748b;">${stat.count}</td>
                  <td style="padding: 10px 12px; text-align: right; font-weight: 800; color: #0F6E56;">₦${stat.approvedValue.toLocaleString("en-NG", { maximumFractionDigits: 2 })}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 14px; text-align: center; margin-top: 24px;">
            <p style="margin: 0; font-size: 12px; color: #475569;">
              📎 <strong>Attached:</strong> Comprehensive Multi-Sheet Executive Workbook (<code>.xlsx</code>) featuring:
              <br/>• <strong>Pre-Auth Log:</strong> Complete clinical authorization log with vetted net approved amounts.
              <br/>• <strong>Payment Advice:</strong> Provider payout settlement schedule aggregated per healthcare facility.
              <br/>• <strong>Clinical Check:</strong> Disease encounter volumes, diagnostic cost analysis, and utilization checks.
              <br/>• <strong>SLA Scorecard:</strong> Turnaround compliance, median response benchmarks, and operational metrics.
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8;">
          Ronsberger HMO Enterprise Intelligence Portal · Automated Executive Monthly Delivery
        </div>
      </div>
    `;

    // -------------------------------------------------------------
    // GENERATE MULTI-SHEET EXECUTIVE EXCEL WORKBOOK (.XLSX)
    // -------------------------------------------------------------
    const wb = XLSX.utils.book_new();

    // SHEET 1: PRE-AUTH MASTER LOG (No Request ID, Capitalized Status, Text Policy Number)
    const sheet1Headers = [
      "S/N",
      "Date Requested",
      "Decided At",
      "Turnaround (Mins)",
      "Auth Code",
      "Status",
      "Hospital",
      "Patient Name",
      "Policy Number",
      "Diagnosis",
      "Service / Treatment",
      "Net Approved (₦)",
      "Decision Reason"
    ];

    const sheet1Rows = allRecords.map((r, i) => {
      let turnMins = "";
      if (r.decided_at && r.created_at) {
        const start = Date.parse(r.treatment_submitted_at || r.created_at);
        const end = Date.parse(r.decided_at);
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          turnMins = String(Math.round((end - start) / 60000));
        }
      }
      const appVal = calculateAccurateApprovedAmount(r);

      return [
        i + 1,
        r.created_at ? new Date(r.created_at).toLocaleString("en-GB") : "",
        r.decided_at ? new Date(r.decided_at).toLocaleString("en-GB") : "",
        turnMins ? Number(turnMins) : "",
        r.authorization_code || "N/A",
        formatCapitalizedStatus(r.status),
        r.requesting_hospital || r.requesting_hospital_name || r.hospital_name || "Unspecified Hospital",
        r.patient_name || "",
        { t: "s", v: String(r.policy_number || "").trim() || "N/A", z: "@" },
        r.diagnosis || "Unspecified",
        r.treatment || "Consultation / Care",
        appVal > 0 ? Number(appVal.toFixed(2)) : 0,
        r.decision_reason || r.rejection_reason || r.notes || ""
      ];
    });

    const ws1 = XLSX.utils.aoa_to_sheet([sheet1Headers, ...sheet1Rows]);
    ws1["!cols"] = [
      { wch: 6 },
      { wch: 20 },
      { wch: 20 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 },
      { wch: 34 },
      { wch: 26 },
      { wch: 20 },
      { wch: 28 },
      { wch: 28 },
      { wch: 20 },
      { wch: 36 },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, "Pre-Auth Log");

    // SHEET 2: PAYMENT ADVICE (Hospital Settlement & Payout Schedule)
    const sheet2Headers = [
      "S/N",
      "Healthcare Provider / Hospital",
      "Total Requests",
      "Approved Requests",
      "Rejected Requests",
      "Approval Rate (%)",
      "Net Approved Payout (₦)",
      "Expenditure Share (%)"
    ];

    const sortedHospitals = Object.entries(hospitalStats).sort((a, b) => b[1].approvedValue - a[1].approvedValue);

    const sheet2Rows = sortedHospitals.map(([hospName, stats], idx) => {
      const appRate = stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(1) + "%" : "0.0%";
      const spendShare = netApprovedValue > 0 ? ((stats.approvedValue / netApprovedValue) * 100).toFixed(1) + "%" : "0.0%";
      return [
        idx + 1,
        hospName,
        stats.total,
        stats.approved,
        stats.rejected,
        appRate,
        Number(stats.approvedValue.toFixed(2)),
        spendShare
      ];
    });

    const sheet2TotalRow = [
      "TOTAL",
      `${sortedHospitals.length} Healthcare Facilities`,
      totalVolume,
      approvedCount,
      rejectedCount,
      approvalRate + "%",
      Number(netApprovedValue.toFixed(2)),
      "100.0%"
    ];

    const ws2 = XLSX.utils.aoa_to_sheet([sheet2Headers, ...sheet2Rows, sheet2TotalRow]);
    ws2["!cols"] = [
      { wch: 6 },
      { wch: 38 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 24 },
      { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "Payment Advice");

    // SHEET 3: CLINICAL CHECK (Diagnosis & Utilization Audit)
    const sheet3Headers = [
      "S/N",
      "Diagnosis / Clinical Condition",
      "Total Encounters",
      "Approved Encounters",
      "Net Approved Value (₦)",
      "Average Cost per Encounter (₦)",
      "Prevalence Share (%)"
    ];

    const sortedDiagnoses = Object.entries(diagnosisStats).sort((a, b) => b[1].count - a[1].count);

    const sheet3Rows = sortedDiagnoses.map(([diagName, stats], idx) => {
      const avgCost = stats.approvedCount > 0 ? Number((stats.approvedValue / stats.approvedCount).toFixed(2)) : 0;
      const prevShare = totalVolume > 0 ? ((stats.count / totalVolume) * 100).toFixed(1) + "%" : "0.0%";
      return [
        idx + 1,
        diagName,
        stats.count,
        stats.approvedCount,
        Number(stats.approvedValue.toFixed(2)),
        avgCost,
        prevShare
      ];
    });

    const sheet3TotalRow = [
      "TOTAL",
      `${sortedDiagnoses.length} Diagnostic Categories`,
      totalVolume,
      approvedCount,
      Number(netApprovedValue.toFixed(2)),
      approvedCount > 0 ? Number((netApprovedValue / approvedCount).toFixed(2)) : 0,
      "100.0%"
    ];

    const ws3 = XLSX.utils.aoa_to_sheet([sheet3Headers, ...sheet3Rows, sheet3TotalRow]);
    ws3["!cols"] = [
      { wch: 6 },
      { wch: 36 },
      { wch: 18 },
      { wch: 20 },
      { wch: 24 },
      { wch: 26 },
      { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws3, "Clinical Check");

    // SHEET 4: EXECUTIVE SLA SCORECARD
    const sheet4Headers = [
      "Executive Metric",
      "Observed Value",
      "Target Benchmark",
      "Performance Assessment"
    ];

    const sheet4Rows = [
      ["Reporting Cycle", monthLabel, "Full Calendar Month", "Audit Completed"],
      ["Total Pre-Auth Volume", String(totalVolume), "All Incoming Requests", "Fully Processed"],
      ["Approved Authorizations", `${approvedCount} (${approvalRate}%)`, "Standard Clinical Eligibility", "Approved"],
      ["Rejected Authorizations", `${rejectedCount} (${rejectionRate}%)`, "Medical Policy Exclusions", "Vetted / Declined"],
      ["Net Approved Expenditure", `₦${netApprovedValue.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, "Strict Approved Items Only", "Financial Audit Passed"],
      ["SLA On-Time Compliance (≤ 15 mins)", `${onTimeCount} (${slaOnTimeRate}%)`, "≥ 80.0% Response Target", Number(slaOnTimeRate) >= 80 ? "Compliant" : "Needs Optimization"],
      ["SLA Warning Window (16 - 30 mins)", `${warningCount} (${totalDecided > 0 ? ((warningCount / totalDecided) * 100).toFixed(1) : "0.0"}%)`, "≤ 15.0% Operational Buffer", "Acceptable Buffer"],
      ["SLA Breached Window (> 30 mins)", `${breachedCount} (${slaBreachRate}%)`, "≤ 5.0% Maximum Threshold", Number(slaBreachRate) <= 5 ? "Within Threshold" : "SLA Escalation Alert"],
      ["Median Turnaround Time", `${medianMinutes} Minutes`, "≤ 15 Minutes Target", medianMinutes <= 15 ? "High Efficiency" : "Moderate Queue Delay"]
    ];

    const ws4 = XLSX.utils.aoa_to_sheet([sheet4Headers, ...sheet4Rows]);
    ws4["!cols"] = [
      { wch: 36 },
      { wch: 28 },
      { wch: 32 },
      { wch: 26 },
    ];
    XLSX.utils.book_append_sheet(wb, ws4, "SLA Scorecard");

    // Convert Workbook to Base64
    const xlsxBase64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });

    // Send via Brevo API
    const brevoSender = getBrevoSender();
    const emailPayload = {
      sender: brevoSender,
      to: parsedRecipients.recipients.map((email: string) => ({ email })),
      subject: `Ronsberger HMO: Executive Monthly Intelligence & SLA Report — ${monthLabel}`,
      htmlContent,
      attachment: [
        {
          name: `RonsbergerHMO_Executive_Monthly_Report_${monthLabel.replace(/\s+/g, "_")}.xlsx`,
          content: xlsxBase64,
        },
      ],
    };

    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      throw new Error(`Brevo API Error (${emailResponse.status}): ${errText}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Monthly report for ${monthLabel} dispatched successfully.`,
        month: monthLabel,
        totalVolume,
        approvedCount,
        netApprovedValue,
        slaOnTimeRate: `${slaOnTimeRate}%`,
        recipients: parsedRecipients.recipients,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: any) {
    console.error("Monthly report error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
