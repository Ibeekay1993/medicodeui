import { useCallback, useEffect, useMemo, useState } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  RefreshCcw,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { useDataPagination } from "@/hooks/use-data-pagination";
import {
  downloadBlob,
  extractNhisPdf,
  NhisBeneficiaryRecord,
  NhisValidationSummary,
  validateNhisRecords,
  recordsToCsv,
  recordsToXlsxBlob,
} from "@/lib/nhisUpdate";
import { readSessionJSON, removeSessionItem, writeSessionJSON } from "@/lib/sessionState";

const CHUNK_SIZE = 1000;

type UpdateRun = {
  id: string;
  original_filename: string;
  status: string;
  total_records: number;
  unique_policy_numbers: number;
  duplicate_records: number;
  missing_fields: number;
  invalid_dates: number;
  previous_record_count: number | null;
  new_record_count: number | null;
  records_added: number | null;
  records_removed: number | null;
  completed_at: string | null;
  created_at: string;
  administrator_name: string | null;
  pdf_path: string | null;
  csv_path: string | null;
  xlsx_path: string | null;
};

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function canReplace(summary: NhisValidationSummary | null) {
  return Boolean(
    summary &&
      summary.totalRecords > 0 &&
      summary.expectedTotal !== null &&
      summary.expectedTotal === summary.totalRecords &&
      summary.skippedRows.length === 0 &&
      (summary.unclassifiedRows?.length ?? 0) === 0 &&
      summary.duplicateRecords === 0 &&
      summary.missingFields === 0 &&
      summary.invalidDates === 0,
  );
}

type NhisUpdateDraft = {
  records: NhisBeneficiaryRecord[];
  summary: NhisValidationSummary | null;
  activeCount: number | null;
  processingMs: number;
  fileName: string | null;
};

export default function NhisBeneficiaryUpdatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<NhisBeneficiaryRecord[]>([]);
  const [summary, setSummary] = useState<NhisValidationSummary | null>(null);
  const [history, setHistory] = useState<UpdateRun[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [allowIncompleteReplacement, setAllowIncompleteReplacement] = useState(false);
  const [incompleteReplacementReason, setIncompleteReplacementReason] = useState("");
  const [progress, setProgress] = useState(0);
  const [processingMs, setProcessingMs] = useState(0);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [replacementResult, setReplacementResult] = useState<{ newCount: number; previousCount: number; difference: number; } | null>(null);
  const { toast } = useToast();
  const { user, fullName } = useAuth();
  const draftKey = user?.id ? `ronsberger:nhis-update:${user.id}` : null;

  const previewRows = useMemo(() => records.slice(0, 25), [records]);
  const csvBlob = useMemo(() => new Blob([recordsToCsv(records)], { type: "text/csv;charset=utf-8" }), [records]);
  const xlsxBlob = useMemo(() => recordsToXlsxBlob(records), [records]);
  const topHcps = useMemo(() => Object.entries(summary?.hcpSummary || {}).sort((a, b) => b[1] - a[1]).slice(0, 8), [summary]);
  const { page, setPage, pageSize, totalPages, pageItems, start, end, total } = useDataPagination(history);
  const recordDifference = summary && activeCount !== null ? summary.totalRecords - activeCount : null;
  const changePercent = summary && activeCount ? Math.abs(summary.totalRecords - activeCount) / activeCount : 0;

  const fetchHistory = useCallback(async () => {
    const { count } = await supabase
      .from("nhis_beneficiaries")
      .select("id", { count: "exact", head: true });
    setActiveCount(count ?? null);

    const { data, error } = await supabase
      .from("nhis_update_runs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast({ variant: "destructive", title: "History Failed", description: getErrorMessage(error, "Unable to load NHIS update history") });
      return;
    }
    setHistory((data || []) as unknown as UpdateRun[]);
  }, [toast]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useTabVisibilityRefresh(fetchHistory);

  useEffect(() => {
    if (!draftKey) {
      setDraftReady(true);
      return;
    }

    const draft = readSessionJSON<NhisUpdateDraft>(draftKey);
    if (draft) {
      setRecords(Array.isArray(draft.records) ? draft.records : []);
      setSummary(draft.summary ?? null);
      setActiveCount(typeof draft.activeCount === "number" ? draft.activeCount : null);
      setProcessingMs(typeof draft.processingMs === "number" ? draft.processingMs : 0);
      setSourceFileName(draft.fileName ?? null);
      setFile(null);
    }

    setDraftReady(true);
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady || !draftKey) return;

    const hasContent = records.length > 0 || Boolean(summary) || Boolean(sourceFileName) || Boolean(file);
    if (!hasContent) {
      removeSessionItem(draftKey);
      return;
    }

    writeSessionJSON(draftKey, {
      records,
      summary,
      activeCount,
      processingMs,
      fileName: file?.name ?? sourceFileName ?? null,
    } satisfies NhisUpdateDraft);
  }, [activeCount, draftKey, draftReady, file, processingMs, records, sourceFileName, summary]);

  const selectFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) {
      toast({ variant: "destructive", title: "PDF Required", description: "Please upload the monthly NHIS PDF file." });
      return;
    }
    setFile(nextFile);
    setSourceFileName(nextFile.name);
    setRecords([]);
    setSummary(null);
    setProgress(0);
  };

  const handleClear = () => {
    setFile(null);
    setRecords([]);
    setSummary(null);
    setSourceFileName(null);
    setProgress(0);
    setProcessingMs(0);
    if (draftKey) removeSessionItem(draftKey);
    toast({
      title: "Draft Cleared",
      description: "You can now upload a new NHIS PDF file.",
    });
  };

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    setProgress(1);
    try {
      const result = await extractNhisPdf(file, setProgress);
      setRecords(result.records);
      setSummary(result.summary);
      setProcessingMs(result.processingMs);
      setSourceFileName(file.name);
      toast({
        title: "Extraction Complete",
        description: `${formatNumber(result.summary.totalRecords)} records extracted from ${file.name}.`,
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Extraction Failed", description: getErrorMessage(error, "Unable to extract this PDF") });
    } finally {
      setExtracting(false);
    }
  };

  const assignMissingMemberType = (row: { recordIndex?: number }, memberType: string) => {
    if (!summary || row.recordIndex === undefined || !memberType) return;
    const updatedRecords = records.map((record, index) =>
      index === row.recordIndex ? { ...record, member_type: memberType } : record
    );
    const remainingUnclassified = (summary.unclassifiedRows ?? []).filter(
      (candidate) => candidate.recordIndex !== row.recordIndex
    );
    setRecords(updatedRecords);
    setSummary(validateNhisRecords(
      updatedRecords,
      summary.expectedTotal,
      summary.skippedRows,
      remainingUnclassified,
      (summary.manualMemberTypeAssignments ?? 0) + 1,
    ));
  };

  const replaceDatabase = async () => {
    if (!summary) return;
    const complete = canReplace(summary);
    const canOverride = summary.totalRecords > 0 &&
      summary.duplicateRecords === 0 && summary.missingFields === 0 && summary.invalidDates === 0;
    const overrideAuthorized = allowIncompleteReplacement && canOverride && incompleteReplacementReason.trim().length >= 10;
    if (!complete && !overrideAuthorized) return;
    setReplacing(true);
    try {
      const { data: run, error: runError } = await supabase
        .from("nhis_update_runs" as any)
        .insert({
          uploaded_by: user?.id,
          administrator_name: fullName || user?.email || "Admin",
          original_filename: file?.name || "unknown",
          status: "validated",
          total_records: summary.totalRecords,
          unique_policy_numbers: summary.uniquePolicyNumbers,
          duplicate_records: summary.duplicateRecords,
          missing_fields: summary.missingFields,
          invalid_dates: summary.invalidDates,
          hcp_summary: summary.hcpSummary,
          validation_results: {
            ...summary,
            allowIncompleteReplacement: !complete && overrideAuthorized,
            incompleteReplacementReason: !complete && overrideAuthorized ? incompleteReplacementReason.trim() : null,
          } as any,
          processing_ms: processingMs,
          logs: [complete ? "PDF extracted and validated from admin dashboard" : "Incomplete PDF replacement explicitly approved by an administrator"],
        })
        .select("*")
        .single();

      if (runError) throw runError;
      const runId = (run as any).id as string;

      for (let index = 0; index < records.length; index += CHUNK_SIZE) {
        const chunk = records.slice(index, index + CHUNK_SIZE).map((record, offset) => ({
          run_id: runId,
          row_number: index + offset + 1,
          ...record,
        }));
        const { error } = await supabase.from("nhis_update_staging" as any).insert(chunk);
        if (error) throw error;
        setProgress(Math.round(((index + chunk.length) / records.length) * 100));
      }

      const { data: replacement, error: replaceError } = await supabase.rpc("replace_nhis_beneficiaries" as any, { _run_id: runId });
      if (replaceError) throw replaceError;

      const newCount = (replacement as any)?.new_record_count || summary.totalRecords;
      const prevCount = activeCount || 0;
      
      setReplacementResult({
        newCount,
        previousCount: prevCount,
        difference: newCount - prevCount
      });

      toast({
        title: "NHIS Dataset Replaced",
        description: `${formatNumber(newCount)} records are now active.`,
      });
      if (draftKey) removeSessionItem(draftKey);
      setFile(null);
      setRecords([]);
      setSummary(null);
      setSourceFileName(null);
      setProgress(0);
      setProcessingMs(0);
      await fetchHistory();
    } catch (error) {
      toast({ variant: "destructive", title: "Replacement Failed", description: getErrorMessage(error, "The previous dataset was not replaced") });
    } finally {
      setReplacing(false);
    }
  };

  const validationOk = canReplace(summary);
  const incompleteCanBeOverridden = Boolean(summary && summary.totalRecords > 0 &&
    summary.duplicateRecords === 0 && summary.missingFields === 0 && summary.invalidDates === 0);
  const overrideReady = allowIncompleteReplacement && incompleteReplacementReason.trim().length >= 10;

  if (replacementResult) {
    return (
      <div className="flex flex-col items-center justify-center p-8 lg:p-16 text-center animate-in zoom-in-95 duration-500">
        <div className="rounded-full bg-emerald-100 p-6 mb-6 shadow-sm">
          <CheckCircle2 className="h-20 w-20 text-emerald-600" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-3">Replacement Complete!</h2>
        <p className="text-lg text-slate-500 mb-10 max-w-lg">
          The NHIS monthly beneficiary dataset has been successfully replaced and the new list is now live across the platform.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 w-full max-w-3xl">
           <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
             <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Previous Records</p>
             <p className="text-3xl font-black text-slate-900">{formatNumber(replacementResult.previousCount)}</p>
           </div>
           <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
             <p className="text-xs font-black uppercase tracking-widest text-emerald-700 mb-2">New Records</p>
             <p className="text-3xl font-black text-emerald-900">{formatNumber(replacementResult.newCount)}</p>
           </div>
           <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-widest text-slate-600 mb-2">Difference</p>
              <p className="text-3xl font-black text-slate-800">
                {replacementResult.difference > 0 ? "+" : ""}{formatNumber(replacementResult.difference)}
              </p>
           </div>
        </div>

        <Button 
          onClick={() => setReplacementResult(null)} 
          className="h-12 px-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-sm font-black uppercase tracking-widest"
        >
          Exit Summary
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      <div className="flex justify-end pb-2">
        <Button variant="outline" onClick={fetchHistory} className="h-9 rounded-xl text-xs font-black uppercase tracking-widest">
          <RefreshCcw className="mr-2 h-4 w-4" /> Refresh History
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card className="rounded-2xl border-slate-100 bg-white p-4 shadow-sm">
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              selectFile(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center transition-colors",
              file ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50/70 hover:border-emerald-200",
            )}
          >
            <UploadCloud className="mb-3 h-10 w-10 text-emerald-600" />
            <p className="text-sm font-black text-slate-900">
              {file ? file.name : sourceFileName ? `${sourceFileName} (restored)` : "Drop monthly NHIS PDF here"}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Upload, extract, preview, then replace the live beneficiary list</p>
            <input
              id="nhis-pdf-upload"
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" className="h-9 rounded-xl text-xs font-black uppercase tracking-widest">
                <label htmlFor="nhis-pdf-upload" className="cursor-pointer">
                  <FileText className="mr-2 inline h-4 w-4" /> Select PDF
                </label>
              </Button>
              <Button
                onClick={handleExtract}
                disabled={!file || extracting || replacing}
                className="h-9 rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest"
              >
                {extracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                Start Extraction
              </Button>
              {(file || sourceFileName || summary) && (
                <Button
                  onClick={handleClear}
                  variant="ghost"
                  disabled={extracting || replacing}
                  className="h-9 rounded-xl text-xs font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  Clear Draft
                </Button>
              )}
            </div>
          </div>

          {(extracting || replacing || progress > 0) && (
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">{replacing ? "Replacing Database" : "Extraction Progress"}</p>
                <span className="text-xs font-black text-slate-700">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {summary && (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Total Extracted", formatNumber(summary.totalRecords), "text-blue-600", FileSpreadsheet],
                ["Unique Policies", formatNumber(summary.uniquePolicyNumbers), "text-emerald-600", CheckCircle2],
                ["Duplicates", formatNumber(summary.duplicateRecords), "text-amber-600", AlertCircle],
                ["Invalid / Missing", formatNumber(summary.invalidDates + summary.missingFields), "text-rose-600", AlertCircle],
              ].map(([label, value, color, Icon]) => (
                <div key={label as string} className="rounded-xl border border-slate-100 bg-white p-4">
                  <Icon className={cn("mb-3 h-5 w-5", color as string)} />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label as string}</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{value as string}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="rounded-2xl border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Validation</p>
            {summary && (
              <Badge className={cn("rounded-full text-xs font-black uppercase", validationOk ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                {validationOk ? (summary.warnings.length ? "Ready With Warning" : "Ready") : "Needs Review"}
              </Badge>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {summary ? (
              <>
                <div className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
                  Previous active count: {activeCount === null ? "Checking..." : formatNumber(activeCount)}.
                  New count: {formatNumber(summary.totalRecords)}.
                  Difference: {recordDifference === null ? "-" : `${recordDifference >= 0 ? "+" : ""}${formatNumber(recordDifference)}`}.
                  PDF grand total: {summary.expectedTotal ? formatNumber(summary.expectedTotal) : "Not detected"}.
                  Processing time: {(processingMs / 1000).toFixed(1)}s.
                  {(summary.manualMemberTypeAssignments ?? 0) > 0 && ` Manually classified: ${summary.manualMemberTypeAssignments}.`}
                </div>
                {changePercent >= 0.1 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                    Large monthly movement detected. Review the preview before replacing the live list.
                  </div>
                )}
                {summary.warnings.map((warning) => (
                  <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{warning}</div>
                ))}
                {!validationOk && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
                    Replacement is blocked until the PDF total matches the extracted row count and every row is parsed without validation errors.
                  </div>
                )}
                {((summary.unclassifiedRows?.length ?? 0) > 0 || summary.skippedRows.length > 0) && (
                  <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                    <p className="font-black">Rows needing review</p>
                    {(summary.unclassifiedRows?.length ?? 0) > 0 && (
                      <p>These rows follow the format “serial number, NHIA number, name, sex, date of birth” with no member type. Select the correct type from the source list.</p>
                    )}
                    {(summary.unclassifiedRows ?? []).map((row, index) => (
                      <div key={`unclassified-${row.page}-${index}`} className="grid gap-2 rounded-lg border border-amber-200 bg-white p-2 sm:grid-cols-[1fr_12rem] sm:items-center">
                        <p>Page {row.page} · {row.hcp_code || "Unknown provider"} · Member type missing · {row.raw}</p>
                        <label className="sr-only" htmlFor={`member-type-${row.page}-${index}`}>Assign member type for this beneficiary</label>
                        <select
                          id={`member-type-${row.page}-${index}`}
                          defaultValue=""
                          onChange={(event) => assignMissingMemberType(row, event.target.value)}
                          className="h-9 rounded-md border border-amber-300 bg-white px-2 text-xs text-slate-800"
                        >
                          <option value="" disabled>Choose member type</option>
                          <option value="PRINCIPAL">Principal</option>
                          <option value="SPOUSE">Spouse</option>
                          <option value="MEMBER">Member</option>
                          <option value="GIFSHIP">GIFSHIP</option>
                          <option value="CHILD">Child</option>
                          <option value="EXTRA DEPENDENT">Extra dependent</option>
                        </select>
                      </div>
                    ))}
                    {summary.skippedRows.map((row, index) => (
                      <p key={`skipped-${row.page}-${index}`}>
                        Page {row.page} · {row.hcp_code || "Unknown provider"} · Not included in extracted list · {row.raw}
                      </p>
                    ))}
                  </div>
                )}
                {!validationOk && incompleteCanBeOverridden && (
                  <div className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-3">
                    <label className="flex cursor-pointer items-start gap-2 text-xs font-bold text-rose-950">
                      <Checkbox
                        checked={allowIncompleteReplacement}
                        onCheckedChange={(checked) => setAllowIncompleteReplacement(checked === true)}
                        aria-label="Authorize replacing the list despite incomplete NHIS data"
                      />
                      <span>I reviewed the unresolved rows and authorize replacing the current NHIS list with this incomplete data.</span>
                    </label>
                    {allowIncompleteReplacement && (
                      <Textarea
                        value={incompleteReplacementReason}
                        onChange={(event) => setIncompleteReplacementReason(event.target.value.slice(0, 500))}
                        placeholder="Reason for approving this incomplete replacement (at least 10 characters)"
                        aria-label="Reason for approving incomplete NHIS replacement"
                        className="min-h-20 bg-white text-xs"
                      />
                    )}
                    <p className="text-xs text-rose-800">This exception is recorded in the update history and audit log. Duplicate rows, missing required fields, or invalid dates still block replacement.</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {topHcps.map(([hcp, count]) => (
                    <div key={hcp} className="rounded-xl border border-slate-100 p-3">
                      <p className="text-xs font-black uppercase text-slate-400">{hcp}</p>
                      <p className="text-sm font-black text-slate-900">{formatNumber(count)}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Button onClick={() => downloadBlob(csvBlob, "extracted_beneficiaries.csv")} variant="outline" className="h-9 rounded-xl text-xs font-black uppercase tracking-widest">
                    <Download className="mr-2 h-4 w-4" /> Download CSV
                  </Button>
                  <Button onClick={() => downloadBlob(xlsxBlob, "extracted_beneficiaries.xlsx")} variant="outline" className="h-9 rounded-xl text-xs font-black uppercase tracking-widest">
                    <Download className="mr-2 h-4 w-4" /> Download Excel
                  </Button>
                  <Button
                    onClick={replaceDatabase}
                    disabled={(!validationOk && !(incompleteCanBeOverridden && overrideReady)) || replacing}
                    className="h-10 rounded-xl bg-emerald-600 text-xs font-black uppercase tracking-widest hover:bg-emerald-700"
                  >
                    {replacing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                    {validationOk ? "Replace Existing List" : "Replace Incomplete List"}
                  </Button>
                  <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                    Complete replacements require a matching PDF total and no skipped or unclassified rows. An incomplete replacement requires an explicit approval and reason.
                  </p>
                </div>
              </>
            ) : (
              <p className="rounded-xl bg-slate-50 p-6 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                Upload and extract a PDF to see quality checks.
              </p>
            )}
          </div>
        </Card>
      </div>

      {records.length > 0 && (
        <Card className="overflow-hidden rounded-2xl border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Preview First 25 Records</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Family policy</TableHead>
                  <TableHead>NHIA member number</TableHead>
                  <TableHead>Member Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>DOB</TableHead>
                  <TableHead>HCP Code</TableHead>
                  <TableHead>Primary Hospital</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((record, index) => (
                  <TableRow key={`${record.policy_number}-${index}`} className="text-xs">
                    <TableCell className="font-black text-emerald-700">{record.policy_number}</TableCell>
                    <TableCell className="font-semibold">{record.beneficiary_number}</TableCell>
                    <TableCell>{record.member_type}</TableCell>
                    <TableCell className="font-bold">{record.full_name}</TableCell>
                    <TableCell>{record.gender}</TableCell>
                    <TableCell>{record.dob}</TableCell>
                    <TableCell className="font-mono">{record.hcp_code}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={record.hcp_name}>{record.hcp_name || <span className="text-slate-300 italic">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden rounded-2xl border-slate-100 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <History className="h-4 w-4 text-emerald-600" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Update History</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Previous</TableHead>
                <TableHead>Added / Removed</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                    No NHIS updates yet.
                  </TableCell>
                </TableRow>
              ) : pageItems.map((run) => (
                <TableRow key={run.id} className="text-xs">
                  <TableCell className="max-w-56 truncate font-bold">{run.original_filename}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs font-black uppercase">{run.status}</Badge></TableCell>
                  <TableCell>{formatNumber(run.new_record_count || run.total_records)}</TableCell>
                  <TableCell>{run.previous_record_count === null ? "-" : formatNumber(run.previous_record_count)}</TableCell>
                  <TableCell>{formatNumber(run.records_added)} / {formatNumber(run.records_removed)}</TableCell>
                  <TableCell>{run.administrator_name === "Codex monthly import" ? "Admin MedAuth" : (run.administrator_name || "Admin")}</TableCell>
                  <TableCell>{new Date(run.completed_at || run.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} />
      </Card>
    </div>
  );
}
