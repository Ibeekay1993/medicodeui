import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Search,
  Download,
  RefreshCw,
  Info,
  ShieldCheck,
  Building2,
  FileCheck2,
  Plus,
  Trash2,
  Save,
  BookmarkCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  HistoricalRawRow,
  HistoricalReconciledRecord,
  HistoricalMatchedItem,
  NhiaTariffItem,
  HospitalReference,
  reconcileHistoricalBatch,
  commitReconciledHistoricalChunk,
} from "../services/historicalReconciliation";

export function HistoricalAuthorisationImportTab() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [tariffs, setTariffs] = useState<NhiaTariffItem[]>([]);
  const [hospitals, setHospitals] = useState<HospitalReference[]>([]);
  const [reconciledRecords, setReconciledRecords] = useState<HistoricalReconciledRecord[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState(0);
  const [commitResult, setCommitResult] = useState<{ inserted: number; updated: number; total: number } | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "declined" | "pending" | "needs_review">("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Manual tariff adjustment dialog
  const [selectedRecord, setSelectedRecord] = useState<HistoricalReconciledRecord | null>(null);
  const [editingItems, setEditingItems] = useState<HistoricalMatchedItem[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [tariffSearchQuery, setTariffSearchQuery] = useState("");

  // Draft persistence for pause-and-resume editing
  const DRAFT_KEY = "medcode_historical_import_draft_v1";
  const [savedDraftNotice, setSavedDraftNotice] = useState<{ count: number; savedAt: string; fileName?: string } | null>(null);
  const [lastAutoSaved, setLastAutoSaved] = useState<string | null>(null);

  // Check for saved local draft on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.records && Array.isArray(parsed.records) && parsed.records.length > 0) {
          setSavedDraftNotice({
            count: parsed.records.length,
            savedAt: parsed.savedAt,
            fileName: parsed.fileName,
          });
        }
      }
    } catch (e) {
      console.warn("Failed to read draft from localStorage:", e);
    }
  }, []);

  // Auto-save to localStorage whenever reconciledRecords is modified
  useEffect(() => {
    if (reconciledRecords.length === 0) return;
    const timer = setTimeout(() => {
      try {
        const draft = {
          records: reconciledRecords,
          fileName: file?.name || savedDraftNotice?.fileName || "Historical Import",
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLastAutoSaved(timeStr);
      } catch (err) {
        console.warn("Auto-save to localStorage failed:", err);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [reconciledRecords, file, savedDraftNotice]);

  const handleSaveDraft = useCallback(() => {
    if (reconciledRecords.length === 0) return;
    try {
      const draft = {
        records: reconciledRecords,
        fileName: file?.name || savedDraftNotice?.fileName || "Historical Import",
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLastAutoSaved(timeStr);
      toast({
        title: "Working Draft Saved",
        description: `Saved ${reconciledRecords.length} records. You can safely close or refresh your browser and continue anytime.`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: err.message || "Could not save draft.",
      });
    }
  }, [reconciledRecords, file, savedDraftNotice, toast]);

  const handleResumeDraft = useCallback(() => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.records && Array.isArray(parsed.records) && parsed.records.length > 0) {

          // ── DRAFT MIGRATION: patch stale records with new rules ─────────────
          // When the engine logic is updated (e.g. dental UCH referral fix),
          // previously-cached drafts still have old data. This patch corrects
          // known stale patterns in-place, preserving all manual edits.
          const DENTAL_UCH_TRIGGER = /rpd|removable\s*partial\s*denture|denture|prosthodontic|kennedy\s*class|implant|crown\s*&\s*bridge|crown\s*and\s*bridge/i;
          const UCH_NAME = "UNIVERSITY COLLEGE HOSPITAL";
          const UCH_ID = "OY/0001/P";
          const JAJA_NAME = "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
          const JAJA_ID_STUB = "OY/0252/P";

          let patchCount = 0;
          const patched: HistoricalReconciledRecord[] = parsed.records.map((rec: HistoricalReconciledRecord) => {
            const treatment = (rec.treatment || rec.raw_treatment || "");
            const hospIsJaja =
              rec.hospital_name?.toLowerCase().includes("jaja") ||
              rec.hospital_name?.toLowerCase().includes("university of ibadan health service");

            // Patch 1: Dental UCH referral hospital correction
            if (DENTAL_UCH_TRIGGER.test(treatment) && hospIsJaja) {
              patchCount++;
              // Preserve existing hospital IDs if they look like real UUIDs, else use stub codes
              const jajaId = rec.hospital_id || JAJA_ID_STUB;
              const uchadId = UCH_ID;

              // Patch approved_items: fix wrong RPD code NHIA-070-022 → NHIA-870-022
              const patchedItems = (rec.approved_items || []).map((item) =>
                item.code === "NHIA-070-022"
                  ? { ...item, code: "NHIA-870-022", name: "Removable Partial Denture (RPD)" }
                  : item
              );

              return {
                ...rec,
                hospital_id: uchadId,
                hospital_name: UCH_NAME,
                requesting_hospital_id: jajaId,
                requesting_hospital_name: JAJA_NAME,
                referred_hospital_id: uchadId,
                referred_hospital_name: UCH_NAME,
                claiming_hospital_id: uchadId,
                claiming_hospital_name: UCH_NAME,
                approved_items: patchedItems,
              };
            }

            // Patch 2: Fix stale RPD tariff code for any dental records already on UCH
            const hasStaleRpdCode = (rec.approved_items || []).some((it) => it.code === "NHIA-070-022");
            if (hasStaleRpdCode) {
              patchCount++;
              return {
                ...rec,
                approved_items: (rec.approved_items || []).map((item) =>
                  item.code === "NHIA-070-022"
                    ? { ...item, code: "NHIA-870-022", name: "Removable Partial Denture (RPD)" }
                    : item
                ),
              };
            }

            return rec;
          });
          // ── END MIGRATION ───────────────────────────────────────────────────

          setReconciledRecords(patched);
          setSavedDraftNotice(null);
          toast({
            title: "Draft Restored" + (patchCount > 0 ? ` · ${patchCount} record(s) auto-updated` : ""),
            description: `Resumed ${patched.length} records (saved ${new Date(parsed.savedAt).toLocaleTimeString()}).` +
              (patchCount > 0
                ? ` ${patchCount} dental record(s) were automatically corrected to show UNIVERSITY COLLEGE HOSPITAL as claiming hospital.`
                : ""),
          });
        }
      }
    } catch (e: any) {
      console.error(e);
    }
  }, [toast]);


  const handleDiscardDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
      setSavedDraftNotice(null);
      setLastAutoSaved(null);
      toast({
        title: "Draft Discarded",
        description: "Cleared saved session draft.",
      });
    } catch (e: any) {
      console.error(e);
    }
  }, [toast]);

  // Load tariffs and hospitals on mount
  useEffect(() => {
    async function loadTariffsAndHospitals() {
      try {
        // Fetch procedures and drugs in TWO separate queries, each ordered by code.
        // This guarantees ALL procedures (incl. consultation NHIA-010-001) load
        // regardless of Supabase PostgREST server-side row limits.
        const [
          { data: procedureData },
          { data: drugData },
          { data: hospData },
        ] = await Promise.all([
          supabase
            .from("nhia_items")
            .select("code, name, category, amount")
            .eq("is_active", true)
            .eq("category", "procedure")
            .order("code")
            .limit(2000),
          supabase
            .from("nhia_items")
            .select("code, name, category, amount")
            .eq("is_active", true)
            .eq("category", "drug")
            .order("code")
            .limit(2000),
          supabase.from("hospitals").select("id, name, code").order("name"),
        ]);

        // Procedures first so they always appear in search results
        const combined: NhiaTariffItem[] = [
          ...((procedureData as NhiaTariffItem[]) || []),
          ...((drugData as NhiaTariffItem[]) || []),
        ];
        if (combined.length > 0) {
          setTariffs(combined);
        }
        if (hospData && hospData.length > 0) {
          setHospitals(hospData as HospitalReference[]);
        }
      } catch (err: any) {
        console.error("Failed to load reference catalogs:", err);
      }
    }
    loadTariffsAndHospitals();
  }, []);


  const handleFileDrop = useCallback(
    async (uploadedFile: File) => {
      setFile(uploadedFile);
      setIsParsing(true);
      setCommitResult(null);
      setCommitProgress(0);

      try {
        const XLSX = await import("xlsx");
        const buffer = await uploadedFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // In july ao.xlsx, row 1 contains data without standard headers
        const rawJson: any[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          raw: false,
        });

        // Filter out blank rows
        const dataRows = rawJson.filter((r) => r && r.some((c) => String(c).trim() !== ""));

        // Check if row 0 is header or data
        let startIndex = 0;
        const firstCol = String(dataRows[0]?.[0] || "").toLowerCase();
        if (firstCol.includes("date") || firstCol.includes("hospital") || firstCol.includes("sn")) {
          startIndex = 1;
        }

        const parsedRows: HistoricalRawRow[] = [];
        for (let i = startIndex; i < dataRows.length; i++) {
          const r = dataRows[i];
          parsedRows.push({
            date: String(r[0] || "").trim(),
            hospital: String(r[1] || "").trim(),
            patient_name: String(r[2] || "").trim(),
            policy_number: String(r[3] || "").trim(),
            authorization_code: String(r[4] || "").trim(),
            diagnosis: String(r[5] || "").trim(),
            treatment: String(r[6] || "").trim(),
            amount: r[7] ? Number(r[7]) : null,
            phone: String(r[8] || "").trim(),
            status: String(r[9] || "APPROVED").trim(),
            category: String(r[10] || "").trim(),
          });
        }

        const summary = reconcileHistoricalBatch(parsedRows, tariffs, hospitals);
        setReconciledRecords(summary.records);

        toast({
          title: "File Analyzed & Reconciled",
          description: `Processed ${summary.totalRecords} records (${summary.approvedCount} approved, ${summary.fullyMatchedCount} fully matched).`,
        });
      } catch (err: any) {
        console.error("Error parsing historical file:", err);
        toast({
          variant: "destructive",
          title: "File Processing Error",
          description: err.message || "Failed to parse historical Excel file.",
        });
      } finally {
        setIsParsing(false);
      }
    },
    [tariffs, hospitals, toast]
  );

  const filteredRecords = useMemo(() => {
    return reconciledRecords.filter((r) => {
      if (statusFilter === "needs_review" && r.reconciliation_status !== "needs_review") return false;
      if (statusFilter === "approved" && r.status !== "approved") return false;
      if (statusFilter === "declined" && r.status !== "declined") return false;
      if (statusFilter === "pending" && r.status !== "pending") return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        r.patient_name.toLowerCase().includes(term) ||
        r.policy_number.toLowerCase().includes(term) ||
        (r.authorization_code || "").toLowerCase().includes(term) ||
        r.diagnosis.toLowerCase().includes(term) ||
        r.treatment.toLowerCase().includes(term) ||
        (r.raw_treatment || "").toLowerCase().includes(term) ||
        r.hospital_name.toLowerCase().includes(term)
      );
    });
  }, [reconciledRecords, statusFilter, searchTerm]);

  const pagedRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page, pageSize]);

  const metrics = useMemo(() => {
    const total = reconciledRecords.length;
    const approved = reconciledRecords.filter((r) => r.status === "approved").length;
    const declined = reconciledRecords.filter((r) => r.status === "declined").length;
    const pending = reconciledRecords.filter((r) => r.status === "pending").length;
    const needsReview = reconciledRecords.filter((r) => r.reconciliation_status === "needs_review").length;
    const totalAmount = reconciledRecords.reduce((sum, r) => sum + r.total_amount, 0);

    return { total, approved, declined, pending, needsReview, totalAmount };
  }, [reconciledRecords]);

  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadPaymentAdvice = async () => {
    if (reconciledRecords.length === 0) return;
    setIsExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = (await import("file-saver")).default;

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "MedCode HMO Portal";
      workbook.lastModifiedBy = "MedCode HMO Portal";
      workbook.created = new Date();
      workbook.modified = new Date();
      const currencyFormat = '"₦"#,##0.00';

      const approvedRecords = reconciledRecords
        .filter((r) => r.status === "approved")
        .sort((a, b) => (a.hospital_name || "").localeCompare(b.hospital_name || ""));

      const schedule = workbook.addWorksheet("Payment Advice Schedule", {
        views: [{ state: "frozen", xSplit: 0, ySplit: 3, showGridLines: false, zoomScale: 85 }],
        properties: { tabColor: { argb: "FF059669" } },
      });

      schedule.columns = [
        { header: "S/N", key: "sn", width: 8 },
        { header: "Approval Date", key: "date", width: 16 },
        { header: "Hospital / Provider", key: "hospital", width: 34 },
        { header: "Auth Code", key: "authCode", width: 22 },
        { header: "Request ID", key: "reqId", width: 22 },
        { header: "Enrollee / Patient", key: "patient", width: 26 },
        { header: "Policy Number", key: "policy", width: 18 },
        { header: "Diagnosis", key: "diagnosis", width: 28 },
        { header: "Approved Items (code, quantity, amount)", key: "treatment", width: 52 },
        { header: "Approved Amount (₦)", key: "appAmt", width: 22 },
        { header: "Authorized By", key: "clinician", width: 22 },
      ];

      schedule.mergeCells("A1:K1");
      const titleCell = schedule.getCell("A1");
      titleCell.value = "PAYMENT ADVICE SCHEDULE";
      titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F3D35" } };
      titleCell.alignment = { vertical: "middle" };
      schedule.getRow(1).height = 32;

      schedule.getRow(2).values = [
        "Source File",
        file?.name || "Historical Import",
        "Records",
        `${approvedRecords.length} Approved`,
        "", "", "", "", "",
        "Total Payable",
        metrics.totalAmount,
      ];
      schedule.getRow(2).height = 24;
      schedule.getRow(2).eachCell((cell, colNum) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        cell.font = colNum % 2 === 1
          ? { bold: true, color: { argb: "FF475569" }, size: 10 }
          : { color: { argb: "FF0F172A" }, size: 10 };
      });
      schedule.getCell("K2").numFmt = currencyFormat;

      const headerRow = schedule.getRow(3);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      headerRow.height = 28;
      headerRow.alignment = { vertical: "middle", wrapText: true };

      approvedRecords.forEach((record, index) => {
        const approvedItems = (record.approved_items || []).filter((item) => item && !item.declined);
        const itemSummary = approvedItems.length
          ? approvedItems.map((item) => {
              const qty = Number(item.quantity || 1);
              const amt = Number(item.amount ?? (Number(item.unit_price || 0) * qty));
              const name = [item.code, item.name].filter(Boolean).join(" ");
              return `${name} × ${qty} · ₦${amt.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }).join("; ")
          : record.treatment || "Approved item details unavailable";

        const dateVal = record.decided_at ? new Date(record.decided_at) : new Date();

        const row = schedule.addRow({
          sn: index + 1,
          date: dateVal,
          hospital: record.hospital_name,
          authCode: record.authorization_code || "N/A",
          reqId: record.request_id,
          patient: record.patient_name,
          policy: record.policy_number,
          diagnosis: record.diagnosis,
          treatment: itemSummary,
          appAmt: Number(record.total_amount) || 0,
          clinician: record.authorized_by_name || "Authorizing Officer (AO)",
        });

        row.height = Math.min(90, Math.max(22, Math.ceil(itemSummary.length / 65) * 15));
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC" } };
          cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
          cell.alignment = {
            vertical: "top",
            wrapText: colNum === 8 || colNum === 9,
            horizontal: colNum === 10 ? "right" : colNum === 1 ? "center" : undefined,
          };
        });
      });

      schedule.getColumn("date").numFmt = "dd/mm/yyyy";
      schedule.getColumn("appAmt").numFmt = currencyFormat;

      const firstDataRow = 4;
      const lastDataRow = firstDataRow + approvedRecords.length - 1;
      const totalRow = schedule.addRow({
        hospital: "TOTAL (Approved Claims)",
        treatment: `Total of ${approvedRecords.length} approved authorisations`,
        appAmt: approvedRecords.length
          ? { formula: `SUBTOTAL(109,J${firstDataRow}:J${lastDataRow})`, result: metrics.totalAmount }
          : metrics.totalAmount,
      });
      totalRow.font = { bold: true, color: { argb: "FF065F46" } };
      totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
      totalRow.getCell("appAmt").numFmt = currencyFormat;
      totalRow.height = 24;

      if (approvedRecords.length) {
        schedule.autoFilter = {
          from: { row: 3, column: 1 },
          to: { row: lastDataRow, column: 11 },
        };
      }

      // Add second sheet with all records including declined
      const allSheet = workbook.addWorksheet("All Imported Records", {
        views: [{ state: "frozen", xSplit: 0, ySplit: 1, showGridLines: true }],
      });
      allSheet.columns = [
        { header: "Row #", key: "row", width: 8 },
        { header: "Auth Code", key: "authCode", width: 22 },
        { header: "Patient Name", key: "patient", width: 26 },
        { header: "Policy #", key: "policy", width: 18 },
        { header: "Hospital", key: "hospital", width: 34 },
        { header: "Diagnosis", key: "diagnosis", width: 28 },
        { header: "Original Request", key: "original", width: 45 },
        { header: "Status", key: "status", width: 14 },
        { header: "Approved Amount (₦)", key: "amount", width: 20 },
        { header: "Reconciliation", key: "reconciliation", width: 16 },
      ];
      allSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      allSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
      allSheet.getRow(1).height = 24;

      reconciledRecords.forEach((r) => {
        allSheet.addRow({
          row: r.row_number,
          authCode: r.authorization_code || "N/A",
          patient: r.patient_name,
          policy: r.policy_number,
          hospital: r.hospital_name,
          diagnosis: r.diagnosis,
          original: r.raw_treatment || r.treatment,
          status: r.status.toUpperCase(),
          amount: r.total_amount,
          reconciliation: r.reconciliation_status.toUpperCase(),
        });
      });
      allSheet.getColumn("amount").numFmt = currencyFormat;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const fileStem = (file?.name || "Historical_Reconciliation").replace(/\.[^/.]+$/, "");
      const fileName = `Payment_Advice_Schedule_${fileStem}_${new Date().toISOString().split("T")[0]}.xlsx`;
      saveAs(blob, fileName);

      toast({
        title: "Payment Advice Downloaded!",
        description: `Exported ${approvedRecords.length} approved records formatted for payment advice.`,
      });
    } catch (err: any) {
      console.error("Export error:", err);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: err.message || "Failed to generate Payment Advice spreadsheet.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCommit = async () => {
    if (reconciledRecords.length === 0) return;
    setIsCommitting(true);
    setCommitProgress(0);

    try {
      const res = await commitReconciledHistoricalChunk(reconciledRecords, (pct) => {
        setCommitProgress(pct);
      });

      setCommitResult(res);
      localStorage.removeItem(DRAFT_KEY);
      setSavedDraftNotice(null);
      setLastAutoSaved(null);
      toast({
        title: "Historical Authorisations Imported!",
        description: `Successfully stored ${res.inserted} new records and updated ${res.updated} existing records.`,
      });
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: err.message,
      });
    } finally {
      setIsCommitting(false);
    }
  };

  const handleOpenReview = (record: HistoricalReconciledRecord) => {
    setSelectedRecord(record);
    const items =
      record.approved_items && record.approved_items.length > 0
        ? JSON.parse(JSON.stringify(record.approved_items))
        : [
            {
              code: "MANUAL_REVIEW",
              name: record.treatment,
              quantity: 30,
              unit_price: 0,
              amount: 0,
              confidence: "manual" as const,
              source_term: record.treatment,
            },
          ];
    setEditingItems(items);
    setActiveSearchIndex(null);
    setTariffSearchQuery("");
  };

  const handleItemFieldChange = (index: number, field: keyof HistoricalMatchedItem, value: any) => {
    setEditingItems((prev) => {
      const next = [...prev];
      const cur = { ...next[index], [field]: value };
      if (field === "unit_price" || field === "quantity") {
        cur.amount = Number(cur.unit_price || 0) * Number(cur.quantity || 1);
      }
      next[index] = cur;
      return next;
    });
  };

  const handleSelectTariffForItem = (index: number, item: NhiaTariffItem) => {
    setEditingItems((prev) => {
      const next = [...prev];
      const isProcedure = (item.category || "").toLowerCase() === "procedure" || item.code.startsWith("NHIA-0") || item.code.startsWith("NHIA-13") || item.code.startsWith("NHIA-18");
      const currentQty = Number(next[index]?.quantity || 1);
      const qty = isProcedure ? 1 : (currentQty > 0 ? currentQty : 30);
      next[index] = {
        ...next[index],
        code: item.code,
        name: item.name,
        unit_price: item.amount,
        quantity: qty,
        amount: item.amount * qty,
        confidence: "high",
      };
      return next;
    });
    setActiveSearchIndex(null);
    setTariffSearchQuery("");
  };

  const handleAddItem = () => {
    const newItem: HistoricalMatchedItem = {
      code: "",
      name: "",
      quantity: 1,
      unit_price: 0,
      amount: 0,
      confidence: "high",
      source_term: selectedRecord?.treatment || "",
    };
    setEditingItems((prev) => [...prev, newItem]);
    const nextIdx = editingItems.length;
    setActiveSearchIndex(nextIdx);
    setTariffSearchQuery("");
  };

  const handleRemoveItem = (index: number) => {
    setEditingItems((prev) => prev.filter((_, i) => i !== index));
    if (activeSearchIndex === index) {
      setActiveSearchIndex(null);
    }
  };

  const handleSaveItemReview = () => {
    if (!selectedRecord) return;
    const finalItems = editingItems.map((it) => {
      const qty = Number(it.quantity || 1);
      const price = Number(it.unit_price || 0);
      return {
        ...it,
        code: it.code || "CONFIRMED",
        name: it.name || "Confirmed Item",
        quantity: qty,
        unit_price: price,
        amount: price * qty,
        confidence: "high" as const,
      };
    });

    const newTotal = finalItems.reduce((sum, i) => sum + (i.declined ? 0 : i.amount), 0);

    const updated = reconciledRecords.map((r) => {
      if (r.row_number === selectedRecord.row_number) {
        return {
          ...r,
          approved_items: finalItems,
          total_amount: newTotal,
          reconciliation_status: "confirmed" as const,
          review_issues: [],
        };
      }
      return r;
    });

    setReconciledRecords(updated);
    setSelectedRecord(null);
    toast({
      title: "Tariff Confirmed & Saved",
      description: `Authorisation for ${selectedRecord.patient_name} updated with ${finalItems.length} item(s) (Total: ₦${newTotal.toLocaleString("en-NG", { minimumFractionDigits: 2 })}).`,
    });
  };

  const filteredTariffList = useMemo(() => {
    if (activeSearchIndex === null) return [];
    const q = tariffSearchQuery.trim().toLowerCase();
    if (!q || q.length < 2) {
      return tariffs.slice(0, 30);
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    return tariffs
      .filter((t) => {
        const name = t.name.toLowerCase();
        const code = t.code.toLowerCase();
        const cat = (t.category || "").toLowerCase();
        return tokens.every((tok) => name.includes(tok) || code.includes(tok) || cat.includes(tok));
      })
      .slice(0, 100);
  }, [activeSearchIndex, tariffSearchQuery, tariffs]);

  return (
    <div className="space-y-6">
      {/* Resume Draft Banner */}
      {savedDraftNotice && reconciledRecords.length === 0 && (
        <Card className="border-blue-200 bg-blue-50/70 shadow-sm rounded-2xl overflow-hidden p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 shrink-0">
                <BookmarkCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-blue-950">
                  Saved Working Session Found ({savedDraftNotice.count} records)
                </h3>
                <p className="text-xs text-blue-700 mt-0.5">
                  Last saved: {new Date(savedDraftNotice.savedAt).toLocaleDateString()} at{" "}
                  {new Date(savedDraftNotice.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {savedDraftNotice.fileName ? ` · Source: ${savedDraftNotice.fileName}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                onClick={handleResumeDraft}
              >
                Resume Working Session
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs text-slate-600 hover:text-rose-600 border-slate-300"
                onClick={handleDiscardDraft}
              >
                Discard Draft
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Upload Zone */}
      {!file && (
        <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700">
                1
              </span>
              Upload Historical Authorisation File (e.g. july ao.xlsx)
            </h2>
          </div>
          <CardContent className="p-6">
            <div className="mb-4 rounded-xl bg-slate-50 p-4 border border-slate-200/60 flex items-start gap-3">
              <Info className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm text-slate-700 space-y-1">
                <p className="font-semibold text-slate-900">Historical Import & Automatic Tariff Reconciliation</p>
                <p className="text-xs text-slate-600">
                  Upload an Excel file containing historical authorisation records. MedCode will resolve hospital entities,
                  match treatment descriptions against the 2,152 active NHIA tariffs, calculate approved amounts, and stage
                  them for the official Payment Advice Schedule.
                </p>
              </div>
            </div>

            <label className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-12 transition-colors hover:border-emerald-500 hover:bg-emerald-50/20 cursor-pointer">
              <Upload className="h-10 w-10 text-slate-400 mb-3" />
              <span className="text-sm font-semibold text-slate-800">Click to upload or drag and drop</span>
              <span className="text-xs text-slate-500 mt-1">.xlsx, .xls or .csv spreadsheets</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileDrop(f);
                }}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {/* Parsing Spinner */}
      {isParsing && (
        <Card className="p-12 text-center border-slate-200">
          <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-800">Analyzing clinical treatments & matching tariffs…</p>
          <p className="text-xs text-slate-500 mt-1">Querying NHIA 2025 catalog and expanding prescription dosages</p>
        </Card>
      )}

      {/* Reconciled Results Screen */}
      {!isParsing && reconciledRecords.length > 0 && (
        <div className="space-y-6">
          {/* Metrics Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Card className="p-4 border-slate-200 bg-white shadow-sm">
              <div className="text-xs font-medium text-slate-500">Total Records</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{metrics.total}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{file?.name}</div>
            </Card>

            <Card className="p-4 border-emerald-100 bg-emerald-50/50 shadow-sm">
              <div className="text-xs font-medium text-emerald-700">Approved</div>
              <div className="text-2xl font-bold text-emerald-800 mt-1">{metrics.approved}</div>
              <div className="text-[11px] text-emerald-600 mt-0.5">Eligible for advice</div>
            </Card>

            <Card className="p-4 border-rose-100 bg-rose-50/50 shadow-sm">
              <div className="text-xs font-medium text-rose-700">Declined</div>
              <div className="text-2xl font-bold text-rose-800 mt-1">{metrics.declined}</div>
              <div className="text-[11px] text-rose-600 mt-0.5">₦0.00 payable</div>
            </Card>

            <Card className="p-4 border-amber-100 bg-amber-50/50 shadow-sm">
              <div className="text-xs font-medium text-amber-700">Needs Review</div>
              <div className="text-2xl font-bold text-amber-800 mt-1">{metrics.needsReview}</div>
              <div className="text-[11px] text-amber-600 mt-0.5">Ambiguous or manual</div>
            </Card>

            <Card className="p-4 border-slate-200 bg-white shadow-sm col-span-2">
              <div className="text-xs font-medium text-slate-500">Approved Payable Total</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                ₦{metrics.totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Calculated from confirmed tariffs</div>
            </Card>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search patient, code, drug..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant={statusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => setStatusFilter("all")}
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === "needs_review" ? "default" : "outline"}
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => setStatusFilter("needs_review")}
                >
                  Needs Review ({metrics.needsReview})
                </Button>
                <Button
                  variant={statusFilter === "declined" ? "default" : "outline"}
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => setStatusFilter("declined")}
                >
                  Declined ({metrics.declined})
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs border-emerald-600/40 text-emerald-800 hover:bg-emerald-50 font-semibold"
                disabled={isExporting || reconciledRecords.length === 0}
                onClick={handleDownloadPaymentAdvice}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Generating Advice…
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5 mr-1.5 text-emerald-700" />
                    Download Payment Advice (.xlsx)
                  </>
                )}
              </Button>

              {lastAutoSaved && (
                <span className="text-[11px] text-slate-500 flex items-center gap-1 mr-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Auto-saved {lastAutoSaved}
                </span>
              )}

              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs border-blue-400 text-blue-700 hover:bg-blue-50 font-medium"
                onClick={handleSaveDraft}
                title="Save current progress and edits locally so you can resume anytime"
              >
                <Save className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                Save Draft
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  setFile(null);
                  setReconciledRecords([]);
                  setCommitResult(null);
                  localStorage.removeItem(DRAFT_KEY);
                  setSavedDraftNotice(null);
                  setLastAutoSaved(null);
                }}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Reset File
              </Button>

              <Button
                size="sm"
                className="h-9 text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                disabled={isCommitting}
                onClick={handleCommit}
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Committing ({commitProgress}%)…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                    Commit to Authorisations
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Progress Bar during commit */}
          {isCommitting && (
            <Card className="p-4 border-emerald-200 bg-emerald-50/50">
              <div className="flex justify-between text-xs font-semibold text-emerald-800 mb-2">
                <span>Writing authorisations in safe controlled chunks (25 rows/call)…</span>
                <span>{commitProgress}%</span>
              </div>
              <Progress value={commitProgress} className="h-2" />
            </Card>
          )}

          {/* Success Banner */}
          {commitResult && (
            <Card className="p-4 border-emerald-300 bg-emerald-50 text-emerald-900 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Historical Import Completed Successfully</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    {commitResult.inserted} authorisations created, {commitResult.updated} records reconciled. You can
                    now download the Payment Advice Schedule directly from the Reports page.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs shrink-0"
                onClick={() => (window.location.href = "/backoffice/admin/reports")}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Open Reports Page
              </Button>
            </Card>
          )}

          {/* Reconciliation Data Table */}
          <Card className="border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                    <th className="py-3 px-2.5 w-8 text-center">#</th>
                    <th className="py-3 px-3 whitespace-nowrap">Date</th>
                    <th className="py-3 px-3 min-w-[200px]">Hospital / Referral</th>
                    <th className="py-3 px-3 whitespace-nowrap">Auth Code</th>
                    <th className="py-3 px-3 min-w-[160px]">Patient & Policy</th>
                    <th className="py-3 px-3 min-w-[150px]">Diagnosis</th>
                    <th className="py-3 px-3 min-w-[280px]">Original Request (Drug / Service)</th>
                    <th className="py-3 px-3 min-w-[340px]">Reconciled Tariffs (Code, Qty, Amount)</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Approved (₦)</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">Status</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRecords.map((rec) => {
                    const isApproved = rec.status === "approved";
                    const isDeclined = rec.status === "declined";

                    return (
                      <tr key={rec.row_number} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-2.5 text-center text-slate-400 font-mono text-[11px]">{rec.row_number}</td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {rec.decided_at ? new Date(rec.decided_at).toLocaleDateString("en-GB") : "N/A"}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800 leading-snug">{rec.hospital_name}</div>
                          {rec.referred_hospital_name && (
                            <div className="text-[10px] text-indigo-600 font-medium mt-0.5">
                              &rarr; Ref: {rec.referred_hospital_name}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                          {rec.authorization_code || <span className="text-slate-400 italic">None</span>}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-900">{rec.patient_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">Pol: {rec.policy_number}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-700 leading-snug">{rec.diagnosis}</td>
                        <td className="py-3 px-3">
                          <div className="max-w-[300px] whitespace-normal break-words text-[11px] text-slate-800 font-mono bg-slate-50/80 p-2 rounded border border-slate-200/80 leading-relaxed">
                            {rec.raw_treatment || rec.treatment}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            {rec.approved_items.map((item, idx) => (
                              <div
                                key={idx}
                                className={`text-[11px] p-1 rounded border ${
                                  item.declined
                                    ? "bg-rose-50 border-rose-200 text-rose-700"
                                    : item.confidence === "manual"
                                    ? "bg-amber-50 border-amber-200 text-amber-800"
                                    : "bg-slate-50 border-slate-200 text-slate-700"
                                }`}
                              >
                                <span className="font-mono font-semibold">{item.code}</span> · {item.name} &times;{" "}
                                {item.quantity} · ₦{item.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          ₦{rec.total_amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {isApproved ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 text-[10px]">
                              Approved
                            </Badge>
                          ) : isDeclined ? (
                            <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-100 text-[10px]">
                              Declined
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-[10px]">
                              Pending
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
                            onClick={() => handleOpenReview(rec)}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between p-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
              <div>
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredRecords.length)} of{" "}
                {filteredRecords.length} records
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page * pageSize >= filteredRecords.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Manual Item Adjustment Modal */}
      <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-6">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-base font-bold text-slate-900">
                Confirm & Adjust Reconciled Tariffs
              </DialogTitle>
              <Badge variant="outline" className="text-xs font-mono bg-emerald-50 text-emerald-800 border-emerald-200">
                Row #{selectedRecord?.row_number}
              </Badge>
            </div>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              Patient: <strong className="text-slate-800">{selectedRecord?.patient_name}</strong> · Policy: <span className="font-mono">{selectedRecord?.policy_number}</span> · Hospital: <span className="text-slate-700">{selectedRecord?.hospital_name}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs overflow-y-auto flex-1 pr-1">
            {/* Original Prescription */}
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80">
              <span className="font-semibold text-slate-700 block text-[11px] uppercase tracking-wider mb-1">
                Original Prescription / Excel Entry:
              </span>
              <p className="text-slate-800 font-mono text-xs bg-white p-2 rounded-lg border border-slate-200/60 break-words">
                {selectedRecord?.raw_treatment || selectedRecord?.treatment}
              </p>
              {selectedRecord?.review_issues && selectedRecord.review_issues.length > 0 && (
                <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200/80 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
                  <span>Flagged Review: {selectedRecord.review_issues.join(" · ")}</span>
                </div>
              )}
            </div>

            {/* List of Reconciled Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">
                  Prescribed Line Items & Tariffs ({editingItems.length})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-dashed text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                  onClick={handleAddItem}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Medication / Service
                </Button>
              </div>

              {editingItems.map((item, idx) => {
                const isSearchActive = activeSearchIndex === idx;
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2.5 relative"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                          {idx + 1}
                        </span>
                        <span>Item #{idx + 1}</span>
                        {item.confidence && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] px-1.5 py-0 font-normal",
                              item.confidence === "high"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.confidence === "medium"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-amber-100 text-amber-800"
                            )}
                          >
                            {item.confidence === "high" ? "High confidence" : item.confidence === "medium" ? "Approx match" : "Manual review"}
                          </Badge>
                        )}
                      </span>

                      {editingItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleRemoveItem(idx)}
                          title="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {/* Search and item description */}
                    <div className="relative">
                      <label className="font-semibold text-slate-600 text-[11px] block mb-1">
                        Search & Select NHIA Tariff (Type drug or procedure name):
                      </label>
                      <div className="relative">
                        <Input
                          value={isSearchActive ? tariffSearchQuery : item.name}
                          onChange={(e) => {
                            setTariffSearchQuery(e.target.value);
                            setActiveSearchIndex(idx);
                            handleItemFieldChange(idx, "name", e.target.value);
                          }}
                          onFocus={() => {
                            setActiveSearchIndex(idx);
                            setTariffSearchQuery(item.name || "");
                          }}
                          placeholder="Type to search e.g. 'parac', 'losartan', 'metformin', 'NHIA-02'..."
                          className="h-8 text-xs pr-8 border-slate-300 focus:border-emerald-600 focus:ring-emerald-600"
                        />
                        <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      </div>

                      {/* Dropdown Popup List */}
                      {isSearchActive && (
                        <div
                          className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl text-xs divide-y divide-slate-100"
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <div className="px-2 py-1 text-[11px] text-slate-400 font-semibold uppercase tracking-wider flex justify-between items-center bg-slate-50 rounded mb-1">
                            <span>NHIA Catalog Matches ({filteredTariffList.length})</span>
                            <span className="text-[10px] text-slate-400">Click to select item</span>
                          </div>

                          {filteredTariffList.length === 0 ? (
                            <div className="p-3 text-center text-slate-500 text-xs">
                              No matching NHIA tariffs found for "{tariffSearchQuery}".
                            </div>
                          ) : (
                            filteredTariffList.map((t) => (
                              <button
                                key={t.code}
                                type="button"
                                onClick={() => handleSelectTariffForItem(idx, t)}
                                className="w-full text-left px-2.5 py-2 hover:bg-emerald-50/80 rounded-lg flex items-center justify-between gap-3 group transition-colors"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <Badge variant="outline" className="font-mono text-[10px] bg-slate-50 text-slate-700 px-1 py-0">
                                      {t.code}
                                    </Badge>
                                    <Badge variant="secondary" className="text-[9px] uppercase px-1 py-0 bg-slate-100 text-slate-600">
                                      {t.category}
                                    </Badge>
                                  </div>
                                  <p className="font-medium text-slate-800 text-xs truncate group-hover:text-emerald-950">
                                    {t.name}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-mono font-bold text-emerald-700 text-xs">
                                    ₦{t.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Code, Qty, Unit Price, Line Total */}
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Tariff Code</label>
                        <Input
                          value={item.code}
                          onChange={(e) => handleItemFieldChange(idx, "code", e.target.value)}
                          placeholder="e.g. NHIA-12-04-49"
                          className="h-8 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Quantity</label>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => handleItemFieldChange(idx, "quantity", Number(e.target.value))}
                          className="h-8 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Unit Price (₦)</label>
                        <Input
                          type="number"
                          min={0}
                          value={item.unit_price}
                          onChange={(e) => handleItemFieldChange(idx, "unit_price", Number(e.target.value))}
                          className="h-8 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Line Total (₦)</label>
                        <div className="h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 flex items-center font-mono font-bold text-xs text-emerald-700 truncate">
                          ₦{(Number(item.unit_price || 0) * Number(item.quantity || 1)).toLocaleString("en-NG", {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grand Total */}
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/80 flex justify-between items-center">
              <div>
                <span className="font-bold text-emerald-950 text-xs block">Total Approved Claim Amount:</span>
                <span className="text-[11px] text-emerald-700">Calculated sum of all {editingItems.length} line items above</span>
              </div>
              <span className="font-bold text-emerald-800 text-base font-mono">
                ₦{editingItems.reduce((sum, it) => sum + (Number(it.unit_price || 0) * Number(it.quantity || 1)), 0).toLocaleString("en-NG", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setSelectedRecord(null)}>
              Cancel
            </Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5" onClick={handleSaveItemReview}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Save & Confirm Authorisation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
