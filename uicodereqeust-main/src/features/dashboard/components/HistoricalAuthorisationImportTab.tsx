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

  // Load tariffs and hospitals on mount
  useEffect(() => {
    async function loadTariffsAndHospitals() {
      try {
        const [{ data: nhiaData }, { data: hospData }] = await Promise.all([
          supabase.from("nhia_items").select("code, name, category, amount").eq("is_active", true).limit(3000),
          supabase.from("hospitals").select("id, name, code").order("name"),
        ]);

        if (nhiaData && nhiaData.length > 0) {
          setTariffs(nhiaData as NhiaTariffItem[]);
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

  const handleCommit = async () => {
    if (reconciledRecords.length === 0) return;
    setIsCommitting(true);
    setCommitProgress(0);

    try {
      const res = await commitReconciledHistoricalChunk(reconciledRecords, (pct) => {
        setCommitProgress(pct);
      });

      setCommitResult(res);
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
      const qty = Number(next[index]?.quantity || 1);
      next[index] = {
        ...next[index],
        code: item.code,
        name: item.name,
        unit_price: item.amount,
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
      quantity: 30,
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
      return tariffs.slice(0, 20);
    }
    return tariffs
      .filter((t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
      .slice(0, 40);
  }, [activeSearchIndex, tariffSearchQuery, tariffs]);

  return (
    <div className="space-y-6">
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

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  setFile(null);
                  setReconciledRecords([]);
                  setCommitResult(null);
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
                {selectedRecord?.treatment}
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
