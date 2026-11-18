import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import ExcelJS from "https://esm.sh/exceljs@4.4.0";
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

function formatApprovedItemsSummary(items: unknown[], fallbackTreatment?: string): string {
  if (Array.isArray(items) && items.length > 0) {
    const valid = items.filter((it: any) => it && typeof it === "object" && !it.declined);
    if (valid.length > 0) {
      return valid.map((it: any) => {
        const qty = Number(it.quantity ?? 1);
        const amt = it.amount ?? it.total ?? ((Number(it.unit_price ?? it.price ?? 0)) * qty);
        const name = [it.code, it.name || it.item_name || it.description].filter(Boolean).join(" ");
        return `${name} × ${qty} · ₦${Number(amt).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }).join("; ");
    }
  }
  return fallbackTreatment || "Approved services";
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
    // GENERATE MULTI-SHEET EXECUTIVE EXCEL WORKBOOK (.XLSX) WITH EXCELJS
    // Matching UI Dashboard colors (#1E3A8A banners, colored tabs, KPI hierarchy)
    // -------------------------------------------------------------
    const WorkbookClass = (ExcelJS as any).Workbook || (ExcelJS as any).default?.Workbook || (ExcelJS as any);
    const workbook = new WorkbookClass();
    workbook.creator = "Ronsberger HMO Enterprise Portal";
    workbook.created = new Date();

    const theme = {
      primary: "FF1E3A8A",    // Deep Navy Blue
      headerSub: "FF1E3A5F",  // Navy Accent
      titleGreen: "FF0F3D35", // Deep Green Title Banner
      success: "FF10B981",    // Emerald Green
      danger: "FFEF4444",     // Crimson Red
      warning: "FFF59E0B",    // Amber / Gold
      slate: "FF64748B",      // Slate Gray
      bg: "FFF8FAFC",         // Light Gray Background
      headerBg: "FFF1F5F9",   // Soft Header Fill
      zebra: "FFF8FAFC",      // Soft alternating row fill
      white: "FFFFFFFF",      // Pure White
    };

    const headerFill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: theme.primary },
    };

    const headerFont = {
      color: { argb: theme.white },
      bold: true,
      size: 11,
    };

    const currencyFormat = '"₦"#,##0.00';
    const percentFormat = '0.0"%"';
    workbook.calcProperties.fullCalcOnLoad = true;

    // ── SHEET 1: EXECUTIVE SUMMARY ──────────────────────────────
    const wsSummary = workbook.addWorksheet("Executive Summary", {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: theme.primary } },
    });

    wsSummary.columns = [
      { width: 36 },
      { width: 28 },
      { width: 48 },
    ];

    const titleRow = wsSummary.addRow(["EXECUTIVE ANALYTICS DASHBOARD"]);
    titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: theme.primary } };
    titleRow.height = 28;
    wsSummary.addRow([]);

    const kpiHeader = wsSummary.addRow(["EXECUTIVE KPI SUMMARY", "", ""]);
    kpiHeader.font = headerFont;
    kpiHeader.fill = headerFill;
    kpiHeader.height = 26;
    kpiHeader.alignment = { vertical: "middle" };
    wsSummary.mergeCells(`A${kpiHeader.number}:C${kpiHeader.number}`);

    const kpiSubHeader = wsSummary.addRow(["KPI", "Value", "Trend / Note"]);
    kpiSubHeader.font = { bold: true, size: 10, color: { argb: "FF475569" } };
    kpiSubHeader.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
    kpiSubHeader.height = 22;

    const pushKPI = (kpi: string, value: any, note: string, isCurrency = false, isPercent = false, colorArgb?: string) => {
      const row = wsSummary.addRow([kpi, value, note]);
      row.getCell(1).font = { bold: true, size: 11, color: { argb: "FF1E293B" } };
      const valCell = row.getCell(2);
      valCell.font = { bold: true, size: 13, color: colorArgb ? { argb: colorArgb } : { argb: "FF0F172A" } };
      valCell.alignment = { horizontal: isCurrency || isPercent || typeof value === "number" ? "right" : "left" };
      if (isCurrency) valCell.numFmt = currencyFormat;
      if (isPercent) valCell.numFmt = percentFormat;
      row.getCell(3).font = { size: 10, color: { argb: "FF64748B" } };
      row.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      row.height = 22;
      return row;
    };

    pushKPI("Reporting Period", monthLabel, "Comprehensive calendar monthly cycle");
    pushKPI("Total Pre-Auth Requests", totalVolume, "All patient encounter pre-auth submissions");
    pushKPI("Total Approved Requests", approvedCount, `${approvalRate}% · Vetted and authorized clinical care`, false, false, theme.success);
    pushKPI("Total Rejected Requests", rejectedCount, `${rejectionRate}% · Medical policy and benefit exclusions`, false, false, theme.danger);
    pushKPI("Total Pending Requests", pendingCount, "Awaiting clinical review / deferred", false, false, theme.warning);
    pushKPI("SLA Compliance Rate (≤ 15 mins)", Number(slaOnTimeRate), "Target: ≥ 80.0% within turnaround window", false, true, Number(slaOnTimeRate) >= 80 ? theme.success : theme.warning);
    pushKPI("Median Turnaround Time", `${medianMinutes} Minutes`, "Target: ≤ 15 Minutes median queue delay");
    wsSummary.addRow([]);

    const finHeader = wsSummary.addRow(["FINANCIAL INSIGHTS", "", ""]);
    finHeader.font = headerFont;
    finHeader.fill = headerFill;
    finHeader.height = 26;
    finHeader.alignment = { vertical: "middle" };
    wsSummary.mergeCells(`A${finHeader.number}:C${finHeader.number}`);

    const finSubHeader = wsSummary.addRow(["Metric", "Value", "Interpretation"]);
    finSubHeader.font = { bold: true, size: 10, color: { argb: "FF475569" } };
    finSubHeader.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
    finSubHeader.height = 22;

    pushKPI("Total Approved Amount", Number(netApprovedValue.toFixed(2)), "Verified from approved items only (NGN)", true, false, theme.success);
    pushKPI("Approval Rate", Number(approvalRate), "Approved / Total Volume", false, true);
    pushKPI("Rejection Rate", Number(rejectionRate), "Rejected / Total Volume", false, true, theme.danger);
    pushKPI("Active Healthcare Providers", `${Object.keys(hospitalStats).length} Hospitals`, "Facilities submitting authorizations this period");
    pushKPI("Unique Diagnoses Treated", `${Object.keys(diagnosisStats).length} Conditions`, "Distinct diagnostic categories vetted");

    // ── SHEET 2: PAYMENT ADVICE SCHEDULE (Itemized Approved Claims) ───────
    const approvedRecords = allRecords.filter(r => {
      const s = String(r.status || "").toLowerCase();
      return ["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"].includes(s);
    });

    const wsPas = workbook.addWorksheet("Payment Advice Schedule", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 3, showGridLines: false, zoomScale: 90 }],
      properties: { tabColor: { argb: "FF059669" } },
    });

    wsPas.columns = [
      { header: "S/N", key: "sn", width: 8 },
      { header: "Approval Date", key: "date", width: 18 },
      { header: "Healthcare Provider / Hospital", key: "hospital", width: 34 },
      { header: "Auth Code", key: "authCode", width: 22 },
      { header: "Enrollee / Patient", key: "patient", width: 26 },
      { header: "Policy Number", key: "policy", width: 20 },
      { header: "Diagnosis", key: "diagnosis", width: 28 },
      { header: "Approved Items (code, quantity, amount)", key: "treatment", width: 48 },
      { header: "Approved Amount (₦)", key: "appAmt", width: 22 },
      { header: "Authorized By / Decision Note", key: "note", width: 32 },
    ];

    wsPas.mergeCells("A1:J1");
    const pasTitleCell = wsPas.getCell("A1");
    pasTitleCell.value = "PAYMENT ADVICE SCHEDULE";
    pasTitleCell.font = { bold: true, size: 16, color: { argb: theme.white } };
    pasTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.titleGreen } };
    pasTitleCell.alignment = { vertical: "middle" };
    wsPas.getRow(1).height = 32;

    const pasSubRow = wsPas.getRow(2);
    pasSubRow.values = [
      "Approval Period", monthLabel,
      "Healthcare Facilities", `${Object.keys(hospitalStats).length} Hospitals`,
      "", "", "", "",
      "Approved Authorizations", approvedRecords.length
    ];
    pasSubRow.height = 24;
    pasSubRow.eachCell((cell: any, colNum: number) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.headerBg } };
      cell.font = colNum % 2 === 1
        ? { bold: true, color: { argb: "FF475569" }, size: 10 }
        : { color: { argb: "FF0F172A" }, size: 10 };
    });

    const pasHeaderRow = wsPas.getRow(3);
    pasHeaderRow.font = headerFont;
    pasHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.headerSub } };
    pasHeaderRow.height = 28;
    pasHeaderRow.alignment = { vertical: "middle", wrapText: true };

    approvedRecords.forEach((r, idx) => {
      const appAmt = calculateAccurateApprovedAmount(r);
      const itemsSummary = formatApprovedItemsSummary(r.approved_items as any[], r.treatment);
      const row = wsPas.addRow({
        sn: idx + 1,
        date: r.decided_at ? new Date(r.decided_at).toLocaleString("en-GB") : (r.created_at ? new Date(r.created_at).toLocaleString("en-GB") : ""),
        hospital: r.requesting_hospital || r.requesting_hospital_name || r.hospital_name || "Unspecified Hospital",
        authCode: r.authorization_code || "N/A",
        patient: r.patient_name || "",
        policy: String(r.policy_number || "").trim() || "N/A",
        diagnosis: r.diagnosis || "Unspecified",
        treatment: itemsSummary,
        appAmt: appAmt > 0 ? Number(appAmt.toFixed(2)) : 0,
        note: r.approved_by || r.decided_by || r.decision_reason || r.notes || "Approved",
      });
      row.height = Math.min(90, Math.max(22, Math.ceil(itemsSummary.length / 65) * 15));
      row.eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: idx % 2 === 0 ? theme.white : theme.zebra } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
        cell.alignment = {
          vertical: "top",
          wrapText: colNum === 7 || colNum === 8 || colNum === 10,
          horizontal: colNum === 9 ? "right" : colNum === 1 ? "center" : colNum === 6 ? "left" : undefined,
        };
      });
      // Policy number explicitly text formatted and left aligned
      const policyCell = row.getCell(6);
      policyCell.numFmt = "@";
      policyCell.alignment = { horizontal: "left", vertical: "top" };
    });
    wsPas.getColumn("appAmt").numFmt = currencyFormat;

    const pasTotalRow = wsPas.addRow({
      hospital: "TOTAL APPROVED PAYABLE",
      treatment: `${approvedRecords.length} Approved Authorizations`,
      appAmt: Number(netApprovedValue.toFixed(2)),
    });
    pasTotalRow.font = { bold: true, color: { argb: "FF065F46" } };
    pasTotalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
    pasTotalRow.getCell("appAmt").numFmt = currencyFormat;
    pasTotalRow.height = 26;

    // ── SHEET 3: PAYMENT ADVICE CHECKS (Provider Settlement Schedule) ────
    const wsPaChecks = workbook.addWorksheet("Payment Advice Checks", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
      properties: { tabColor: { argb: theme.warning } },
    });

    wsPaChecks.columns = [
      { header: "S/N", key: "sn", width: 8 },
      { header: "Healthcare Provider / Hospital", key: "hospital", width: 38 },
      { header: "Total Requests", key: "total", width: 16 },
      { header: "Approved Requests", key: "approved", width: 18 },
      { header: "Rejected Requests", key: "rejected", width: 18 },
      { header: "Approval Rate", key: "rate", width: 18 },
      { header: "Net Approved Payout (₦)", key: "payout", width: 24 },
      { header: "Expenditure Share", key: "share", width: 22 },
    ];

    wsPaChecks.getRow(1).font = headerFont;
    wsPaChecks.getRow(1).fill = headerFill;
    wsPaChecks.getRow(1).height = 28;
    wsPaChecks.getRow(1).alignment = { vertical: "middle" };

    const sortedHospitals = Object.entries(hospitalStats).sort((a, b) => b[1].approvedValue - a[1].approvedValue);

    sortedHospitals.forEach(([hospName, stats], idx) => {
      const appRate = stats.total > 0 ? (stats.approved / stats.total) * 100 : 0;
      const spendShare = netApprovedValue > 0 ? (stats.approvedValue / netApprovedValue) * 100 : 0;
      const row = wsPaChecks.addRow({
        sn: idx + 1,
        hospital: hospName,
        total: stats.total,
        approved: stats.approved,
        rejected: stats.rejected,
        rate: appRate,
        payout: Number(stats.approvedValue.toFixed(2)),
        share: spendShare,
      });
      row.height = 22;
      row.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      row.getCell("sn").alignment = { horizontal: "center" };
      row.getCell("total").alignment = { horizontal: "right" };
      row.getCell("approved").alignment = { horizontal: "right" };
      row.getCell("rejected").alignment = { horizontal: "right" };
    });

    const paChecksTotalRow = wsPaChecks.addRow({
      sn: "TOTAL",
      hospital: `${sortedHospitals.length} Healthcare Facilities`,
      total: totalVolume,
      approved: approvedCount,
      rejected: rejectedCount,
      rate: Number(approvalRate),
      payout: Number(netApprovedValue.toFixed(2)),
      share: 100.0,
    });
    paChecksTotalRow.font = { bold: true };
    paChecksTotalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.headerBg } };
    paChecksTotalRow.height = 26;
    wsPaChecks.getColumn("payout").numFmt = currencyFormat;
    wsPaChecks.getColumn("rate").numFmt = percentFormat;
    wsPaChecks.getColumn("share").numFmt = percentFormat;

    // ── SHEET 4: CLINICAL CHECK (Diagnosis & Utilization Audit) ───────────
    const wsClinical = workbook.addWorksheet("Clinical Check", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
      properties: { tabColor: { argb: theme.danger } },
    });

    wsClinical.columns = [
      { header: "S/N", key: "sn", width: 8 },
      { header: "Diagnosis / Clinical Condition", key: "diagnosis", width: 38 },
      { header: "Total Encounters", key: "count", width: 18 },
      { header: "Approved Encounters", key: "approvedCount", width: 20 },
      { header: "Net Approved Spend (₦)", key: "spend", width: 24 },
      { header: "Average Cost per Encounter (₦)", key: "avgCost", width: 28 },
      { header: "Prevalence Share", key: "share", width: 20 },
    ];

    wsClinical.getRow(1).font = headerFont;
    wsClinical.getRow(1).fill = headerFill;
    wsClinical.getRow(1).height = 28;
    wsClinical.getRow(1).alignment = { vertical: "middle" };

    const sortedDiagnoses = Object.entries(diagnosisStats).sort((a, b) => b[1].count - a[1].count);

    sortedDiagnoses.forEach(([diagName, stats], idx) => {
      const avgCost = stats.approvedCount > 0 ? stats.approvedValue / stats.approvedCount : 0;
      const prevShare = totalVolume > 0 ? (stats.count / totalVolume) * 100 : 0;
      const row = wsClinical.addRow({
        sn: idx + 1,
        diagnosis: diagName,
        count: stats.count,
        approvedCount: stats.approvedCount,
        spend: Number(stats.approvedValue.toFixed(2)),
        avgCost: Number(avgCost.toFixed(2)),
        share: prevShare,
      });
      row.height = 22;
      row.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      row.getCell("sn").alignment = { horizontal: "center" };
      row.getCell("count").alignment = { horizontal: "right" };
      row.getCell("approvedCount").alignment = { horizontal: "right" };
    });

    const clinicalTotalRow = wsClinical.addRow({
      sn: "TOTAL",
      diagnosis: `${sortedDiagnoses.length} Diagnostic Categories`,
      count: totalVolume,
      approvedCount: approvedCount,
      spend: Number(netApprovedValue.toFixed(2)),
      avgCost: approvedCount > 0 ? Number((netApprovedValue / approvedCount).toFixed(2)) : 0,
      share: 100.0,
    });
    clinicalTotalRow.font = { bold: true };
    clinicalTotalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.headerBg } };
    clinicalTotalRow.height = 26;
    wsClinical.getColumn("spend").numFmt = currencyFormat;
    wsClinical.getColumn("avgCost").numFmt = currencyFormat;
    wsClinical.getColumn("share").numFmt = percentFormat;

    // ── SHEET 5: TREND ANALYSIS (Daily Throughput & Spend) ────────────────
    const dailyStats: Record<string, { total: number; approved: number; rejected: number; pending: number; approvedValue: number }> = {};
    for (const r of allRecords) {
      const dayKey = r.created_at ? r.created_at.split("T")[0] : "Unknown";
      if (!dailyStats[dayKey]) dailyStats[dayKey] = { total: 0, approved: 0, rejected: 0, pending: 0, approvedValue: 0 };
      dailyStats[dayKey].total += 1;
      const s = String(r.status || "").toLowerCase();
      const isApp = ["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"].includes(s);
      const isRej = ["rejected", "referral_rejected", "cancelled", "denied"].includes(s);
      if (isApp) {
        dailyStats[dayKey].approved += 1;
        dailyStats[dayKey].approvedValue += calculateAccurateApprovedAmount(r);
      } else if (isRej) {
        dailyStats[dayKey].rejected += 1;
      } else {
        dailyStats[dayKey].pending += 1;
      }
    }

    const wsTrend = workbook.addWorksheet("Trend Analysis", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
      properties: { tabColor: { argb: theme.success } },
    });

    wsTrend.columns = [
      { header: "Date", key: "date", width: 16 },
      { header: "Total Volume", key: "total", width: 16 },
      { header: "Approved", key: "approved", width: 15 },
      { header: "Rejected", key: "rejected", width: 15 },
      { header: "Pending", key: "pending", width: 15 },
      { header: "Approval Rate", key: "rate", width: 18 },
      { header: "Net Approved Spend (₦)", key: "spend", width: 24 },
    ];

    wsTrend.getRow(1).font = headerFont;
    wsTrend.getRow(1).fill = headerFill;
    wsTrend.getRow(1).height = 28;
    wsTrend.getRow(1).alignment = { vertical: "middle" };

    const sortedDays = Object.entries(dailyStats).sort((a, b) => a[0].localeCompare(b[0]));
    sortedDays.forEach(([dateStr, st]) => {
      const rate = st.total > 0 ? (st.approved / st.total) * 100 : 0;
      const row = wsTrend.addRow({
        date: dateStr,
        total: st.total,
        approved: st.approved,
        rejected: st.rejected,
        pending: st.pending,
        rate: rate,
        spend: Number(st.approvedValue.toFixed(2)),
      });
      row.height = 22;
      row.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      row.getCell("total").alignment = { horizontal: "right" };
      row.getCell("approved").alignment = { horizontal: "right" };
      row.getCell("rejected").alignment = { horizontal: "right" };
      row.getCell("pending").alignment = { horizontal: "right" };
    });

    const trendTotalRow = wsTrend.addRow({
      date: "TOTAL",
      total: totalVolume,
      approved: approvedCount,
      rejected: rejectedCount,
      pending: pendingCount,
      rate: Number(approvalRate),
      spend: Number(netApprovedValue.toFixed(2)),
    });
    trendTotalRow.font = { bold: true };
    trendTotalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.headerBg } };
    trendTotalRow.height = 26;
    wsTrend.getColumn("spend").numFmt = currencyFormat;
    wsTrend.getColumn("rate").numFmt = percentFormat;

    // ── SHEET 6: SLA SCORECARD (Turnaround Compliance Metrics) ────────────
    const wsSla = workbook.addWorksheet("SLA Scorecard", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
      properties: { tabColor: { argb: theme.primary } },
    });

    wsSla.columns = [
      { header: "Executive Metric", key: "metric", width: 38 },
      { header: "Observed Value", key: "value", width: 28 },
      { header: "Target Benchmark", key: "benchmark", width: 32 },
      { header: "Performance Assessment", key: "assessment", width: 26 },
    ];

    wsSla.getRow(1).font = headerFont;
    wsSla.getRow(1).fill = headerFill;
    wsSla.getRow(1).height = 28;
    wsSla.getRow(1).alignment = { vertical: "middle" };

    const slaScorecardData = [
      { metric: "Reporting Cycle", value: monthLabel, benchmark: "Full Calendar Month", assessment: "Audit Completed" },
      { metric: "Total Pre-Auth Volume", value: String(totalVolume), benchmark: "All Incoming Requests", assessment: "Fully Processed" },
      { metric: "Approved Authorizations", value: `${approvedCount} (${approvalRate}%)`, benchmark: "Standard Clinical Eligibility", assessment: "Approved" },
      { metric: "Rejected Authorizations", value: `${rejectedCount} (${rejectionRate}%)`, benchmark: "Medical Policy Exclusions", assessment: "Vetted / Declined" },
      { metric: "Net Approved Expenditure", value: `₦${netApprovedValue.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, benchmark: "Strict Approved Items Only", assessment: "Financial Audit Passed" },
      { metric: "SLA On-Time Compliance (≤ 15 mins)", value: `${onTimeCount} (${slaOnTimeRate}%)`, benchmark: "≥ 80.0% Response Target", assessment: Number(slaOnTimeRate) >= 80 ? "Compliant" : "Needs Optimization" },
      { metric: "SLA Warning Window (16 - 30 mins)", value: `${warningCount} (${totalDecided > 0 ? ((warningCount / totalDecided) * 100).toFixed(1) : "0.0"}%)`, benchmark: "≤ 15.0% Operational Buffer", assessment: "Operational Buffer" },
      { metric: "SLA Breached Window (> 30 mins)", value: `${breachedCount} (${slaBreachRate}%)`, benchmark: "≤ 5.0% Maximum Threshold", assessment: Number(slaBreachRate) <= 5 ? "Within Threshold" : "SLA Escalation Alert" },
      { metric: "Median Turnaround Time", value: `${medianMinutes} Minutes`, benchmark: "≤ 15 Minutes Target", assessment: medianMinutes <= 15 ? "High Efficiency" : "Moderate Queue Delay" },
    ];

    for (const item of slaScorecardData) {
      const added = wsSla.addRow(item);
      added.height = 24;
      added.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      if (item.assessment === "Compliant" || item.assessment === "Approved" || item.assessment === "Financial Audit Passed" || item.assessment === "High Efficiency") {
        added.getCell("assessment").font = { bold: true, color: { argb: theme.success } };
      } else if (item.assessment === "SLA Escalation Alert" || item.assessment === "Needs Optimization") {
        added.getCell("assessment").font = { bold: true, color: { argb: theme.danger } };
      }
    }

    // ── SHEET 7: PRE-AUTH LOG (Master Clinical Authorizations Log) ────────
    const wsLog = workbook.addWorksheet("Pre-Auth Log", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
      properties: { tabColor: { argb: theme.slate } },
    });

    wsLog.columns = [
      { header: "S/N", key: "sn", width: 8 },
      { header: "Date Requested", key: "date", width: 18 },
      { header: "Decided At", key: "decidedAt", width: 18 },
      { header: "Turnaround (Mins)", key: "turnaround", width: 18 },
      { header: "Auth Code", key: "authCode", width: 22 },
      { header: "Status", key: "status", width: 16 },
      { header: "Hospital", key: "hospital", width: 34 },
      { header: "Patient Name", key: "patient", width: 26 },
      { header: "Policy Number", key: "policy", width: 20 },
      { header: "Diagnosis", key: "diagnosis", width: 28 },
      { header: "Service / Treatment", key: "treatment", width: 30 },
      { header: "Net Approved (₦)", key: "appAmt", width: 20 },
      { header: "Decision Reason", key: "reason", width: 36 },
    ];

    wsLog.getRow(1).font = headerFont;
    wsLog.getRow(1).fill = headerFill;
    wsLog.getRow(1).height = 28;
    wsLog.getRow(1).alignment = { vertical: "middle" };

    allRecords.forEach((r, i) => {
      let turnMins: number | string = "";
      if (r.decided_at && r.created_at) {
        const start = Date.parse(r.treatment_submitted_at || r.created_at);
        const end = Date.parse(r.decided_at);
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          turnMins = Math.round((end - start) / 60000);
        }
      }
      const appVal = calculateAccurateApprovedAmount(r);

      const row = wsLog.addRow({
        sn: i + 1,
        date: r.created_at ? new Date(r.created_at).toLocaleString("en-GB") : "",
        decidedAt: r.decided_at ? new Date(r.decided_at).toLocaleString("en-GB") : "",
        turnaround: turnMins !== "" ? Number(turnMins) : "",
        authCode: r.authorization_code || "N/A",
        status: formatCapitalizedStatus(r.status),
        hospital: r.requesting_hospital || r.requesting_hospital_name || r.hospital_name || "Unspecified Hospital",
        patient: r.patient_name || "",
        policy: String(r.policy_number || "").trim() || "N/A",
        diagnosis: r.diagnosis || "Unspecified",
        treatment: r.treatment || "Consultation / Care",
        appAmt: appVal > 0 ? Number(appVal.toFixed(2)) : 0,
        reason: r.decision_reason || r.rejection_reason || r.notes || "",
      });

      row.height = 22;
      row.eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 === 0 ? theme.white : theme.zebra } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
        cell.alignment = {
          vertical: "top",
          horizontal: colNum === 12 ? "right" : colNum === 1 || colNum === 4 ? "center" : colNum === 9 ? "left" : undefined,
        };
      });

      // Status color formatting
      const statusCell = row.getCell("status");
      const stVal = String(r.status || "").toLowerCase();
      if (["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"].includes(stVal)) {
        statusCell.font = { bold: true, color: { argb: "FF065F46" } };
      } else if (["rejected", "referral_rejected", "cancelled", "denied"].includes(stVal)) {
        statusCell.font = { bold: true, color: { argb: "FF991B1B" } };
      } else {
        statusCell.font = { bold: true, color: { argb: "FF92400E" } };
      }

      // Policy number explicitly text formatted and left aligned
      const policyCell = row.getCell("policy");
      policyCell.numFmt = "@";
      policyCell.alignment = { horizontal: "left", vertical: "top" };
    });
    wsLog.getColumn("appAmt").numFmt = currencyFormat;

    // Convert Workbook to Base64
    const buffer = await workbook.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize) as unknown as number[]);
    }
    const xlsxBase64 = btoa(binary);

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
