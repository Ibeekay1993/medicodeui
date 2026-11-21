// src/features/dashboard/reports/reportsExcelExport.ts
// Handles ExcelJS workbook creation, multi-sheet analytical reporting,
// payment advice schedules, SLA scorecards, and binary workbook downloads.

import { saveAs } from "file-saver";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { auditExport } from "@/lib/auditExport";
import {
  FilterState,
  PreAuthRecord,
  ReportStats,
  RequestStatus,
  buildDateFilter,
  calculateApprovedAmount,
  formatCapitalizedStatus,
  PREAUTH_REPORT_SELECT_COLUMNS,
} from "@/lib/reports-helpers";

export type PaymentAdviceRecord = PreAuthRecord & { source_total_amount: number | null };

function formatScopeDate(date: Date): string {
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export async function fetchPaymentAdviceRecords(filters: FilterState): Promise<PaymentAdviceRecord[]> {
  const dateRange = buildDateFilter(filters.dateFilter, filters.startDate, filters.endDate);
  const hospitalId = filters.hospitalFilter === "all" ? null : filters.hospitalFilter;
  const approvedRows: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from("authorization_requests")
      .select(PREAUTH_REPORT_SELECT_COLUMNS)
      .in("status", ["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"])
      .order("decided_at", { ascending: true })
      .order("id", { ascending: true });
    if (dateRange.from) query = query.gte("decided_at", dateRange.from.toISOString());
    if (dateRange.to) query = query.lte("decided_at", dateRange.to.toISOString());
    if (hospitalId) {
      query = query.or([
        `claiming_hospital_id.eq.${hospitalId}`,
        `referred_hospital_id.eq.${hospitalId}`,
        `requesting_hospital_id.eq.${hospitalId}`,
        `hospital_id.eq.${hospitalId}`,
      ].join(","));
    }

    const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    approvedRows.push(...data);
    if (data.length < pageSize) break;
    page += 1;
  }

  return approvedRows
    .map((item: any) => ({
      id: item.id,
      created_at: item.created_at,
      request_id: item.request_id || "",
      patient_name: item.patient_name || "",
      patient_phone: item.patient_phone || item.phone || item.phone_number || "",
      patient_email: item.patient_email || item.email || "",
      policy_number: item.policy_number || "",
      diagnosis: item.diagnosis || "",
      treatment: item.treatment || "",
      requesting_hospital: item.claiming_hospital_name || item.referred_hospital_name || item.requesting_hospital_name || item.hospital_name || "",
      hospital_id: item.claiming_hospital_id || item.referred_hospital_id || item.requesting_hospital_id || item.hospital_id,
      source: item.source || "Manual",
      authorization_code: item.authorization_code || "",
      status: item.status as RequestStatus,
      approved_amount: calculateApprovedAmount(item),
      approved_items: Array.isArray(item.approved_items) ? item.approved_items : [],
      source_total_amount: item.total_amount === null || item.total_amount === undefined || item.total_amount === ""
        ? null
        : Number.isFinite(Number(item.total_amount)) ? Number(item.total_amount) : null,
      rejection_reason: item.decision_reason || "",
      decision_reason: item.decision_reason || "",
      decided_at: item.decided_at || undefined,
      decided_by: item.decided_by,
      approved_by: item.approved_by,
      treatment_submitted_at: item.treatment_submitted_at,
      urgency: item.urgency,
      clinician: item.authorized_by_name || "",
    }))
    .sort((a, b) => (a.requesting_hospital || "").localeCompare(b.requesting_hospital || "") || new Date(a.decided_at || a.created_at).getTime() - new Date(b.decided_at || b.created_at).getTime());
}

export function addPaymentAdviceWorksheets(
  workbook: any,
  records: PaymentAdviceRecord[],
  filters: FilterState,
  hospitalLabel: string,
  currencyFormat: string,
  headerFont: any,
) {
  const titleFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F3D35" },
  };
  const headerFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A5F" },
  };
  const dateRange = buildDateFilter(filters.dateFilter, filters.startDate, filters.endDate);
  const approvalPeriod = dateRange.from && dateRange.to
    ? `${formatScopeDate(dateRange.from)} to ${formatScopeDate(dateRange.to)}`
    : dateRange.from
      ? `From ${formatScopeDate(dateRange.from)}`
      : dateRange.to
        ? `Through ${formatScopeDate(dateRange.to)}`
        : "All available dates";
  const amountTotal = records.reduce((sum, record) => sum + Math.round((Number(record.approved_amount) || 0) * 100), 0) / 100;
  const firstDataRow = 4;
  const lastDataRow = firstDataRow + records.length - 1;

  const schedule = workbook.addWorksheet("Payment Advice Schedule", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 3, showGridLines: false, zoomScale: 85 }],
    properties: { tabColor: { argb: "FF059669" } },
  });
  schedule.columns = [
    { header: "S/N", key: "sn", width: 8 },
    { header: "Approval Date", key: "date", width: 16 },
    { header: "Hospital / Provider", key: "hospital", width: 32 },
    { header: "Auth Code", key: "authCode", width: 20 },
    { header: "Request ID", key: "reqId", width: 19 },
    { header: "Enrollee / Patient", key: "patient", width: 24 },
    { header: "Policy Number", key: "policy", width: 18 },
    { header: "Diagnosis", key: "diagnosis", width: 28 },
    { header: "Approved Items (code, quantity, amount)", key: "treatment", width: 48 },
    { header: "Approved Amount (₦)", key: "appAmt", width: 21 },
    { header: "Authorized By", key: "clinician", width: 22 },
  ];
  schedule.mergeCells("A1:K1");
  schedule.getCell("A1").value = "PAYMENT ADVICE SCHEDULE";
  schedule.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  schedule.getCell("A1").fill = titleFill;
  schedule.getCell("A1").alignment = { vertical: "middle" };
  schedule.getRow(1).height = 32;
  schedule.getRow(2).values = ["Approval period", approvalPeriod, "Hospital", hospitalLabel, "", "", "", "", "", "Visible requests", records.length
    ? { formula: `SUBTOTAL(103,A${firstDataRow}:A${lastDataRow})`, result: records.length }
    : 0];
  if (records.length) {
    schedule.getCell("K2").value = { formula: `SUBTOTAL(103,A${firstDataRow}:A${lastDataRow})`, result: records.length };
  }
  schedule.getRow(2).height = 24;
  schedule.getRow(2).eachCell((cell: any, columnNumber: number) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.font = columnNumber % 2 === 1
      ? { bold: true, color: { argb: "FF475569" }, size: 10 }
      : { color: { argb: "FF0F172A" }, size: 10 };
  });
  const headerRow = schedule.getRow(3);
  headerRow.font = headerFont;
  headerRow.fill = headerFill;
  headerRow.height = 28;
  headerRow.alignment = { vertical: "middle", wrapText: true };

  records.forEach((record, index) => {
    const approvedItems = (record.approved_items || []).filter((item: any) => item && !item.declined);
    const itemSummary = approvedItems.length
      ? approvedItems.map((item: any) => {
          const quantity = Number(item.quantity || 1);
          const amount = Number(item.amount ?? (Number(item.unit_price || item.price || 0) * quantity));
          const name = [item.code, item.name].filter(Boolean).join(" ");
          return `${name} × ${quantity} · ₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }).join("; ")
      : record.treatment || "Approved item details unavailable";
    const row = schedule.addRow({
      sn: index + 1,
      date: record.decided_at ? new Date(record.decided_at) : "Missing decision date",
      hospital: record.requesting_hospital,
      authCode: record.authorization_code,
      reqId: record.request_id,
      patient: record.patient_name,
      policy: record.policy_number,
      diagnosis: record.diagnosis,
      treatment: itemSummary,
      appAmt: Number(record.approved_amount) || 0,
      clinician: record.clinician || "",
    });
    row.height = Math.min(90, Math.max(22, Math.ceil(itemSummary.length / 65) * 15));
    row.eachCell({ includeEmpty: true }, (cell: any, columnNumber: number) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC" } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      cell.alignment = {
        vertical: "top",
        wrapText: columnNumber === 8 || columnNumber === 9,
        horizontal: columnNumber === 10 ? "right" : columnNumber === 1 ? "center" : undefined,
      };
    });
  });
  schedule.getColumn("date").numFmt = "dd/mm/yyyy";
  schedule.getColumn("appAmt").numFmt = currencyFormat;
  const totalRow = schedule.addRow({
    hospital: "TOTAL (visible rows)",
    treatment: "Approved payable amount",
    appAmt: records.length
      ? { formula: `SUBTOTAL(109,J${firstDataRow}:J${lastDataRow})`, result: amountTotal }
      : amountTotal,
  });
  totalRow.font = { bold: true, color: { argb: "FF065F46" } };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
  totalRow.getCell("appAmt").numFmt = currencyFormat;
  totalRow.height = 24;
  if (records.length) {
    schedule.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: lastDataRow, column: 11 },
    };
  }

  const checks = workbook.addWorksheet("Payment Advice Checks", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 3, showGridLines: false, zoomScale: 90 }],
    properties: { tabColor: { argb: "FF64748B" } },
  });
  checks.columns = [
    { header: "Request ID", key: "requestId", width: 22 },
    { header: "Authorization Code", key: "authCode", width: 22 },
    { header: "Approved Amount (Schedule)", key: "scheduleAmount", width: 27 },
    { header: "Stored Approved Total", key: "storedAmount", width: 24 },
    { header: "Difference", key: "difference", width: 18 },
    { header: "Data Quality Issues", key: "issues", width: 58 },
  ];
  checks.mergeCells("A1:F1");
  checks.getCell("A1").value = "PAYMENT ADVICE CHECKS";
  checks.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  checks.getCell("A1").fill = titleFill;
  checks.getCell("A1").alignment = { vertical: "middle" };
  checks.getRow(1).height = 32;

  const issueRows: Array<{ requestId: string; authCode: string; scheduleAmount: number; storedAmount: number | string; difference: number | string; issues: string }> = [];
  for (const record of records) {
    const issues = [
      !record.requesting_hospital && "Missing provider",
      !record.authorization_code && "Missing authorization code",
      !record.request_id && "Missing request ID",
      !record.patient_name && "Missing patient name",
      !record.policy_number && "Missing policy number",
      !record.diagnosis && "Missing diagnosis",
      !(record.approved_items || []).some((item: any) => item && !item.declined) && "Missing approved item details",
      !record.decided_at && "Missing decision date",
      record.source_total_amount === null && "Missing stored approved total",
    ].filter(Boolean) as string[];
    const difference = record.source_total_amount === null ? null : Number(record.approved_amount) - record.source_total_amount;
    if (difference !== null && Math.abs(difference) >= 0.01) issues.push("Approved item sum differs from stored approved total");
    if (!issues.length) continue;
    issueRows.push({
      requestId: record.request_id,
      authCode: record.authorization_code,
      scheduleAmount: Number(record.approved_amount) || 0,
      storedAmount: record.source_total_amount ?? "Missing",
      difference: difference ?? "Not compared",
      issues: issues.join("; "),
    });
  }

  checks.getRow(2).values = ["Approved records checked", records.length, "Records needing attention", issueRows.length];
  checks.getRow(2).height = 24;
  checks.getRow(2).eachCell((cell: any, columnNumber: number) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.font = { bold: columnNumber % 2 === 1, color: { argb: columnNumber % 2 === 1 ? "FF475569" : "FF0F172A" }, size: 10 };
  });
  const checksHeader = checks.getRow(3);
  checksHeader.font = headerFont;
  checksHeader.fill = headerFill;
  checksHeader.height = 28;
  checksHeader.alignment = { vertical: "middle", wrapText: true };
  for (const issue of issueRows) {
    const row = checks.addRow(issue);
    row.height = 30;
    row.eachCell({ includeEmpty: true }, (cell: any) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      cell.alignment = { vertical: "top", wrapText: true };
    });
    row.getCell("issues").font = { color: { argb: "FF92400E" } };
    row.getCell("issues").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
  }
  if (!issueRows.length) {
    const clearRow = checks.addRow({ issues: records.length
      ? "No missing payment fields or amount differences found."
      : "No approved requests fell within this approval period." });
    clearRow.font = { color: { argb: "FF475569" }, italic: true };
  } else {
    checks.autoFilter = { from: { row: 3, column: 1 }, to: { row: checks.rowCount, column: 6 } };
  }
  for (const column of ["scheduleAmount", "storedAmount", "difference"]) {
    checks.getColumn(column).numFmt = currencyFormat;
  }
  return { totalAmount: amountTotal, rowCount: records.length };
}

export interface ExportReportOptions {
  mode: "detailed" | "full" | "payment_advice";
  filters: FilterState;
  records: PreAuthRecord[];
  stats: ReportStats;
  hospitalPerformance: any[];
  dailyTrend: any[];
  hospitals: { id: string; name: string; code?: string }[];
  selectedHospitalName?: string;
  onStart?: () => void;
  onFinish?: () => void;
}

export async function exportReportToExcel({
  mode = "full",
  filters,
  records,
  stats,
  hospitalPerformance,
  dailyTrend,
  hospitals,
  selectedHospitalName,
  onStart,
  onFinish,
}: ExportReportOptions) {
  onStart?.();
  const toastLabel = mode === "payment_advice"
    ? "Payment Advice Schedule"
    : mode === "full"
    ? "Full Excel report"
    : "Detailed Data Export";
  toast.info(`Preparing ${toastLabel}…`);

  try {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Ronsberger HMO System";
    workbook.created = new Date();

    const theme = {
      primary: "FF1E3A8A", // Blue
      success: "FF10B981", // Green
      danger: "FFEF4444",  // Red
      warning: "FFF59E0B", // Amber
      bg: "FFF8FAFC",      // Light Gray
      text: "FF374151",    // Dark Gray
    };

    const headerFill: any = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: theme.primary },
    };

    const headerFont: any = {
      color: { argb: "FFFFFFFF" },
      bold: true,
      size: 12,
    };

    const currencyFormat = '"₦"#,##0.00';
    const percentFormat = '0.0"%"';
    workbook.calcProperties.fullCalcOnLoad = true;
    let paymentAdviceRowCount = 0;

    const approvedAdviceRecords = mode === "full" || mode === "payment_advice"
      ? await fetchPaymentAdviceRecords(filters)
      : [];
    paymentAdviceRowCount = approvedAdviceRecords.length;

    if (mode === "payment_advice" && approvedAdviceRecords.length === 0) {
      toast.warning("No approved requests found in the current filter scope to generate Payment Advice.");
      return;
    }

    if (mode === "payment_advice") {
      addPaymentAdviceWorksheets(
        workbook,
        approvedAdviceRecords,
        filters,
        selectedHospitalName || "All hospitals",
        currencyFormat,
        headerFont,
      );
    } else {
      if (mode === "full") {
        // ── SHEET 1: Executive Summary ──
        const ws1 = workbook.addWorksheet("Executive Summary", {
          views: [{ showGridLines: false }],
          properties: { tabColor: { argb: theme.primary } },
        });

        ws1.columns = [{ width: 35 }, { width: 25 }, { width: 45 }];

        ws1.addRow(["EXECUTIVE ANALYTICS DASHBOARD"]).font = { size: 16, bold: true, color: { argb: theme.primary } };
        ws1.addRow([]);

        const kpiHeader = ws1.addRow(["EXECUTIVE KPI SUMMARY", "", ""]);
        kpiHeader.font = headerFont;
        kpiHeader.fill = headerFill;
        ws1.mergeCells(`A${kpiHeader.number}:C${kpiHeader.number}`);

        const kpiSubHeader = ws1.addRow(["KPI", "Value", "Trend / Note"]);
        kpiSubHeader.font = { bold: true };
        kpiSubHeader.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };

        const pushKPI = (kpi: string, value: any, note: string, isCurrency = false, isPercent = false, colorArgb?: string) => {
          const row = ws1.addRow([kpi, value, note]);
          row.getCell(1).font = { bold: true };
          const valCell = row.getCell(2);
          valCell.font = { bold: true, size: 14, color: colorArgb ? { argb: colorArgb } : undefined };
          valCell.alignment = { horizontal: "right" };
          if (isCurrency) valCell.numFmt = currencyFormat;
          if (isPercent) valCell.numFmt = percentFormat;
        };

        pushKPI("Total Authorization Requests", stats.totalCodes, "Current filtered scope");
        pushKPI("Total Approved Requests", stats.approvedCodes, "Current filtered scope", false, false, theme.success);
        pushKPI("Total Rejected Requests", stats.rejectedCodes, "Current filtered scope", false, false, theme.danger);
        pushKPI("Total Pending Requests", stats.pendingCodes, "Current filtered scope", false, false, theme.warning);
        ws1.addRow([]);

        const finHeader = ws1.addRow(["FINANCIAL INSIGHTS", "", ""]);
        finHeader.font = headerFont;
        finHeader.fill = headerFill;
        ws1.mergeCells(`A${finHeader.number}:C${finHeader.number}`);

        const finSubHeader = ws1.addRow(["Metric", "Value", "Interpretation"]);
        finSubHeader.font = { bold: true };
        finSubHeader.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };

        pushKPI("Total Approved Amount", stats.approvedAmount, "Verified from approved items (NGN)", true, false, theme.success);
        pushKPI("Approval Rate", stats.approvalRate, "Approved / Total Volume", false, true);
        pushKPI("Rejection Rate", stats.rejectionRate, "Rejected / Total Volume", false, true, theme.danger);
        const paymentAdvice = addPaymentAdviceWorksheets(
          workbook,
          approvedAdviceRecords,
          filters,
          selectedHospitalName || "All hospitals",
          currencyFormat,
          headerFont,
        );
        pushKPI("Payment Advice Payable", paymentAdvice.totalAmount, `${paymentAdvice.rowCount} approved requests by approval date`, true, false, theme.success);

        // ── SHEET 2: Trend Analysis ──
        const ws2 = workbook.addWorksheet("Trend Analysis", {
          views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
          properties: { tabColor: { argb: theme.success } },
        });

        ws2.columns = [
          { header: "Date", key: "date", width: 15 },
          { header: "Total Volume", key: "total", width: 15 },
          { header: "Approved", key: "approved", width: 15 },
          { header: "Rejected", key: "rejected", width: 15 },
          { header: "Pending", key: "pending", width: 15 },
          { header: "Approval Rate", key: "rate", width: 18 },
        ];

        ws2.getRow(1).font = headerFont;
        ws2.getRow(1).fill = headerFill;

        for (const p of dailyTrend) {
          const total = (p.approved || 0) + (p.rejected || 0) + (p.pending || 0);
          const rate = total > 0 ? ((p.approved || 0) / total) * 100 : 0;
          ws2.addRow({
            date: p.date,
            total,
            approved: p.approved,
            rejected: p.rejected,
            pending: p.pending,
            rate,
          });
        }

        ws2.getColumn("rate").numFmt = percentFormat;
        ws2.addConditionalFormatting({
          ref: `F2:F${Math.max(2, dailyTrend.length + 1)}`,
          rules: [{ type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }], priority: 1, gradient: true }],
        });

        // ── SHEET 3: Payment Advice ──
        const ws3 = workbook.addWorksheet("Payment Advice", {
          views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
          properties: { tabColor: { argb: theme.warning } },
        });

        ws3.columns = [
          { header: "S/N", key: "sn", width: 8 },
          { header: "Healthcare Provider / Hospital", key: "hospital", width: 38 },
          { header: "Total Volume", key: "total", width: 16 },
          { header: "Approved Requests", key: "approved", width: 18 },
          { header: "Rejected Requests", key: "rejected", width: 18 },
          { header: "Approval Rate", key: "rate", width: 18 },
          { header: "Net Approved Payout (₦)", key: "appAmt", width: 24 },
          { header: "Expenditure Share", key: "share", width: 22 },
        ];

        ws3.getRow(1).font = headerFont;
        ws3.getRow(1).fill = headerFill;

        const sortedHospitals = [...hospitalPerformance].sort((a, b) => (b.approvedAmount || 0) - (a.approvedAmount || 0));
        const totalApprovedSpend = sortedHospitals.reduce((sum, h) => sum + (h.approvedAmount || 0), 0);
        const totalHospitalCodes = sortedHospitals.reduce((sum, h) => sum + (h.totalCodes || 0), 0);
        const totalHospitalApproved = sortedHospitals.reduce((sum, h) => sum + (h.approvedCodes || 0), 0);
        const totalHospitalRejected = sortedHospitals.reduce((sum, h) => sum + (h.rejectedCodes || 0), 0);

        sortedHospitals.forEach((h, idx) => {
          const spendShare = totalApprovedSpend > 0 ? (h.approvedAmount / totalApprovedSpend) * 100 : 0;
          ws3.addRow({
            sn: idx + 1,
            hospital: h.hospital,
            total: h.totalCodes,
            approved: h.approvedCodes,
            rejected: h.rejectedCodes,
            rate: h.approvalRate,
            appAmt: h.approvedAmount,
            share: spendShare,
          });
        });

        const totalHospRow = ws3.addRow({
          sn: "TOTAL",
          hospital: `${sortedHospitals.length} Healthcare Facilities`,
          total: totalHospitalCodes,
          approved: totalHospitalApproved,
          rejected: totalHospitalRejected,
          rate: totalHospitalCodes > 0 ? (totalHospitalApproved / totalHospitalCodes) * 100 : 0,
          appAmt: totalApprovedSpend,
          share: 100,
        });
        totalHospRow.font = { bold: true };
        totalHospRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };

        ws3.getColumn("appAmt").numFmt = currencyFormat;
        ws3.getColumn("rate").numFmt = percentFormat;
        ws3.getColumn("share").numFmt = percentFormat;

        // ── SHEET 4: Clinical Check ──
        const ws4 = workbook.addWorksheet("Clinical Check", {
          views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
          properties: { tabColor: { argb: theme.danger } },
        });

        ws4.columns = [
          { header: "S/N", key: "sn", width: 8 },
          { header: "Diagnosis / Clinical Condition", key: "diagnosis", width: 38 },
          { header: "Total Encounters", key: "count", width: 18 },
          { header: "Approved Encounters", key: "approvedCount", width: 20 },
          { header: "Net Approved Spend (₦)", key: "appAmt", width: 24 },
          { header: "Average Cost per Encounter (₦)", key: "avgCost", width: 28 },
          { header: "Prevalence Share", key: "pct", width: 20 },
        ];

        ws4.getRow(1).font = headerFont;
        ws4.getRow(1).fill = headerFill;

        const diagMap: Record<string, { count: number; approvedCount: number; approvedAmount: number }> = {};
        for (const r of records) {
          const d = (r.diagnosis || "Unspecified Diagnosis").trim();
          if (!diagMap[d]) diagMap[d] = { count: 0, approvedCount: 0, approvedAmount: 0 };
          diagMap[d].count += 1;
          const s = String(r.status || "").toLowerCase();
          if (["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"].includes(s)) {
            diagMap[d].approvedCount += 1;
            diagMap[d].approvedAmount += Number(r.approved_amount) || 0;
          }
        }
        const sortedDiags = Object.entries(diagMap).sort((a, b) => b[1].count - a[1].count);
        const totalEncounterCount = records.length;
        const totalDiagApprovedCount = sortedDiags.reduce((sum, d) => sum + d[1].approvedCount, 0);
        const totalDiagApprovedAmount = sortedDiags.reduce((sum, d) => sum + d[1].approvedAmount, 0);

        sortedDiags.forEach(([diag, stat], idx) => {
          const avgCost = stat.approvedCount > 0 ? stat.approvedAmount / stat.approvedCount : 0;
          const prevShare = totalEncounterCount > 0 ? (stat.count / totalEncounterCount) * 100 : 0;
          ws4.addRow({
            sn: idx + 1,
            diagnosis: diag,
            count: stat.count,
            approvedCount: stat.approvedCount,
            appAmt: stat.approvedAmount,
            avgCost,
            pct: prevShare,
          });
        });

        const totalDiagRow = ws4.addRow({
          sn: "TOTAL",
          diagnosis: `${sortedDiags.length} Diagnostic Categories`,
          count: totalEncounterCount,
          approvedCount: totalDiagApprovedCount,
          appAmt: totalDiagApprovedAmount,
          avgCost: totalDiagApprovedCount > 0 ? totalDiagApprovedAmount / totalDiagApprovedCount : 0,
          pct: 100,
        });
        totalDiagRow.font = { bold: true };
        totalDiagRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };

        ws4.getColumn("appAmt").numFmt = currencyFormat;
        ws4.getColumn("avgCost").numFmt = currencyFormat;
        ws4.getColumn("pct").numFmt = percentFormat;

        // ── SHEET 5: SLA Scorecard ──
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

        let slaOnTime = 0;
        let slaWarning = 0;
        let slaBreached = 0;
        const turnaroundDurations: number[] = [];

        for (const r of records) {
          if (r.decided_at && r.created_at) {
            const start = Date.parse(r.treatment_submitted_at || r.created_at);
            const end = Date.parse(r.decided_at);
            if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
              const mins = Math.round((end - start) / 60000);
              turnaroundDurations.push(mins);
              if (mins <= 15) slaOnTime += 1;
              else if (mins <= 30) slaWarning += 1;
              else slaBreached += 1;
            }
          }
        }

        const totalSlaDecided = slaOnTime + slaWarning + slaBreached;
        const slaOnTimePct = totalSlaDecided > 0 ? (slaOnTime / totalSlaDecided) * 100 : 0;
        const slaWarningPct = totalSlaDecided > 0 ? (slaWarning / totalSlaDecided) * 100 : 0;
        const slaBreachPct = totalSlaDecided > 0 ? (slaBreached / totalSlaDecided) * 100 : 0;

        const sortedTurnaround = [...turnaroundDurations].sort((a, b) => a - b);
        const medianMinutes = sortedTurnaround.length > 0
          ? (sortedTurnaround.length % 2 === 1
              ? sortedTurnaround[Math.floor(sortedTurnaround.length / 2)]
              : Math.round((sortedTurnaround[sortedTurnaround.length / 2 - 1] + sortedTurnaround[sortedTurnaround.length / 2]) / 2))
          : 0;

        const slaScorecardData = [
          { metric: "Total Pre-Auth Volume", value: String(stats.totalCodes), benchmark: "All Incoming Requests", assessment: "Processed" },
          { metric: "Approved Authorizations", value: `${stats.approvedCodes} (${stats.approvalRate.toFixed(1)}%)`, benchmark: "Clinical Protocol Compliance", assessment: "Approved" },
          { metric: "Rejected Authorizations", value: `${stats.rejectedCodes} (${stats.rejectionRate.toFixed(1)}%)`, benchmark: "Medical Policy Exclusions", assessment: "Declined" },
          { metric: "Pending Authorizations", value: `${stats.pendingCodes}`, benchmark: "Current Active Queue", assessment: "In Review" },
          { metric: "Net Approved Expenditure", value: `₦${stats.approvedAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, benchmark: "Strict Tariff Verified Only", assessment: "Audited" },
          { metric: "SLA On-Time Compliance (≤ 15 mins)", value: `${slaOnTime} (${slaOnTimePct.toFixed(1)}%)`, benchmark: "≥ 80.0% Target Benchmark", assessment: slaOnTimePct >= 80 ? "Compliant" : "Needs Optimization" },
          { metric: "SLA Warning Window (16 – 30 mins)", value: `${slaWarning} (${slaWarningPct.toFixed(1)}%)`, benchmark: "≤ 15.0% Operational Buffer", assessment: "Operational Buffer" },
          { metric: "SLA Breached Window (> 30 mins)", value: `${slaBreached} (${slaBreachPct.toFixed(1)}%)`, benchmark: "≤ 5.0% Maximum Threshold", assessment: slaBreachPct <= 5 ? "Within Threshold" : "SLA Escalation Alert" },
          { metric: "Median Turnaround Time", value: `${medianMinutes} Minutes`, benchmark: "≤ 15 Minutes Target", assessment: medianMinutes <= 15 ? "High Efficiency" : "Queue Delay" },
        ];

        for (const row of slaScorecardData) {
          const added = wsSla.addRow(row);
          added.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
        }
      }

      // ── SHEET 6 / DEFAULT: Pre-Auth Log ──
      const wsLog = workbook.addWorksheet("Pre-Auth Log", {
        views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
        properties: { tabColor: { argb: theme.bg } },
      });

      wsLog.columns = [
        { header: "S/N", key: "sn", width: 8 },
        { header: "Date Requested", key: "date", width: 18 },
        { header: "Decided At", key: "decidedAt", width: 18 },
        { header: "Turnaround (Mins)", key: "turnaround", width: 18 },
        { header: "Auth Code", key: "authCode", width: 22 },
        { header: "Status", key: "status", width: 16 },
        { header: "Hospital", key: "hospital", width: 35 },
        { header: "Patient Name", key: "patient", width: 25 },
        { header: "Policy Number", key: "policy", width: 20 },
        { header: "Diagnosis", key: "diagnosis", width: 30 },
        { header: "Service / Treatment", key: "treatment", width: 32 },
        { header: "Approved Amount (₦)", key: "appAmt", width: 22 },
        { header: "Decision Reason", key: "note", width: 40 },
        { header: "Clinician", key: "clinician", width: 20 },
      ];

      wsLog.getRow(1).font = headerFont;
      wsLog.getRow(1).fill = headerFill;

      records.forEach((r, idx) => {
        let turnaroundMins: number | string = "";
        if (r.decided_at && r.created_at) {
          const start = Date.parse(r.treatment_submitted_at || r.created_at);
          const end = Date.parse(r.decided_at);
          if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
            turnaroundMins = Math.round((end - start) / 60000);
          }
        }

        const row = wsLog.addRow({
          sn: idx + 1,
          date: r.created_at ? new Date(r.created_at).toLocaleString("en-GB") : "",
          decidedAt: r.decided_at ? new Date(r.decided_at).toLocaleString("en-GB") : "",
          turnaround: turnaroundMins !== "" ? Number(turnaroundMins) : "",
          authCode: r.authorization_code || "N/A",
          status: formatCapitalizedStatus(r.status),
          hospital: r.requesting_hospital || "Unspecified Hospital",
          patient: r.patient_name || "",
          policy: String(r.policy_number || "").trim() || "N/A",
          diagnosis: r.diagnosis || "Unspecified",
          treatment: r.treatment || "Consultation / Care",
          appAmt: Number(r.approved_amount) || 0,
          note: r.rejection_reason || r.decision_reason || "",
          clinician: r.clinician || "",
        });

        const policyCell = row.getCell("policy");
        policyCell.numFmt = "@";
        policyCell.alignment = { horizontal: "left" };
      });

      wsLog.getColumn("appAmt").numFmt = currencyFormat;
      wsLog.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, records.length), column: 14 },
      };
    }

    // ── DOWNLOAD ──
    const selectedHospital =
      filters.hospitalFilter === "all"
        ? "All_Hospitals"
        : hospitals.find((h) => h.id === filters.hospitalFilter)?.name?.replace(/[^a-z0-9]+/gi, "_") || "Selected";

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const filename = mode === "payment_advice"
      ? `Payment_Advice_Schedule_${selectedHospital}_${filters.dateFilter}_${new Date().toISOString().split("T")[0]}.xlsx`
      : mode === "full"
      ? `PreAuth_Executive_Dashboard_${selectedHospital}_${new Date().toISOString().split("T")[0]}.xlsx`
      : `PreAuth_Detailed_Data_${selectedHospital}_${new Date().toISOString().split("T")[0]}.xlsx`;

    saveAs(blob, filename);

    void auditExport({
      exportType: "excel",
      resource: "authorization_requests",
      rowCount: mode === "payment_advice" ? paymentAdviceRowCount : records.length,
      filters: {
        mode,
        hospital: filters.hospitalFilter,
        dateFilter: filters.dateFilter,
      },
    });

    toast.success(
      mode === "payment_advice"
        ? `Exported Payment Advice Schedule (${paymentAdviceRowCount} approved claims, filtered by approval date)`
        : `Exported ${records.length} records (${mode === "full" ? "Full report" : "Detailed data"})`,
    );
  } catch (error) {
    console.error("Export error:", error);
    toast.error(getErrorMessage(error, "Failed to export Excel dashboard"));
  } finally {
    onFinish?.();
  }
}
