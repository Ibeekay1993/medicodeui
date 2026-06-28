import { useMemo, useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Trash2, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

type ImportMode = "add" | "merge" | "replace" | "wipe";

const supportedFields = [
  "record_type",
  "original_code",
  "beneficiary_code",
  "policy_number",
  "authorization_code",
  "claim_number",
  "hospital_code",
  "provider_code",
  "invoice_number",
  "payment_reference",
  "patient_name",
  "hospital_name",
  "date_of_birth",
  "diagnosis",
  "treatment",
  "legacy_creation_date",
];

const importModeOptions: Array<{ value: ImportMode; label: string; description: string }> = [
  {
    value: "merge",
    label: "Merge missing fields",
    description: "Creates new codes and fills only blank fields on existing codes.",
  },
  {
    value: "add",
    label: "Add only",
    description: "Simply adds new records to the database. Will not delete or modify existing information.",
  },
  {
    value: "wipe",
    label: "Wipe & Replace Database",
    description: "DANGER: Utterly deletes all existing historical data before importing.",
  },
];

const guessField = (header: string) => {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (supportedFields.includes(normalized)) return normalized;
  if (normalized.includes("auth") || normalized === "pa_code") return "authorization_code";
  if (normalized.includes("claim")) return "claim_number";
  if (normalized.includes("policy") || normalized.includes("hmo_no")) return "policy_number";
  if (normalized.includes("beneficiary") || normalized.includes("enrollee") || normalized.includes("patient_id")) return "beneficiary_code";
  if (normalized.includes("hospital") || normalized.includes("provider") || normalized.includes("clinic")) return normalized.includes("name") ? "hospital_name" : "hospital_code";
  if (normalized.includes("payment")) return "payment_reference";
  if (normalized.includes("diagnosis") || normalized.includes("condition") || normalized.includes("ailment")) return "diagnosis";
  if (normalized.includes("name") && !normalized.includes("hospital")) return "patient_name";
  if (normalized === "code" || normalized.includes("legacy_code") || normalized.includes("id")) return "original_code";
  if (normalized.includes("date") && !normalized.includes("birth") && !normalized.includes("dob")) return "legacy_creation_date";
  if (normalized.includes("dob") || (normalized.includes("date") && normalized.includes("birth"))) return "date_of_birth";
  return "";
};

const normalizeCode = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();

export default function HistoricalCodeImportPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState<ImportMode | "">("");
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [replaceConfirmation, setReplaceConfirmation] = useState("");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);
  const [importProgress, setImportProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  const mappedRows = useMemo(() => {
    return rows.map((row) => {
      const output: Record<string, any> = {};
      headers.forEach((header) => {
        const field = mapping[header];
        if (field) output[field] = row[header];
      });
      const bestCode = output.original_code || output.authorization_code || output.claim_number || output.policy_number || output.beneficiary_code || output.hospital_code || output.payment_reference;
      output.original_code = bestCode;
      output.record_type = output.record_type || (
        output.authorization_code ? "authorization" :
        output.claim_number ? "claim" :
        output.policy_number ? "policy" :
        output.beneficiary_code ? "beneficiary" :
        output.hospital_code ? "hospital" :
        output.payment_reference ? "payment" :
        "code"
      );
      return output;
    });
  }, [headers, mapping, rows]);

  const analysis = useMemo(() => {
    const seen = new Set<string>();
    let missing = 0;
    let duplicates = 0;
    mappedRows.forEach((row) => {
      const key = `${row.record_type}:${normalizeCode(row.original_code)}`;
      if (!normalizeCode(row.original_code)) {
        missing += 1;
      } else if (seen.has(key)) {
        duplicates += 1;
      } else {
        seen.add(key);
      }
    });
    return {
      total: mappedRows.length,
      unique: seen.size,
      duplicates,
      missing,
    };
  }, [mappedRows]);

  const parseFile = async (f: File, headersIncluded: boolean) => {
    const buffer = await f.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { 
      defval: "", 
      raw: false,
      ...(headersIncluded ? {} : { header: "A" }) 
    });
    const parsedHeaders = parsed[0] ? Object.keys(parsed[0]) : [];
    setHeaders(parsedHeaders);
    setRows(parsed);
    setMapping(Object.fromEntries(parsedHeaders.map((header) => [header, guessField(header)])));
  };

  const handleFile = async (f?: File) => {
    if (!f) return;
    const isValidType = f.name.endsWith('.csv') || f.name.endsWith('.xls') || f.name.endsWith('.xlsx');
    if (!isValidType) {
      toast({ variant: "destructive", title: "Invalid file type", description: "Please upload a CSV or Excel file." });
      return;
    }
    setFile(f);
    setFileName(f.name);
    setSummary(null);
    setCurrentPage(1);
    setImportProgress(0);
    await parseFile(f, hasHeaders);
  };

  const clearFile = () => {
    setFile(null);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setSummary(null);
    setCurrentPage(1);
    setImportProgress(0);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleFile(droppedFile);
  }, [hasHeaders, toast]);

  useEffect(() => {
    if (file) {
      parseFile(file, hasHeaders);
    }
  }, [hasHeaders]);

  const runImport = async (mode: ImportMode = importMode) => {
    if (mappedRows.length === 0) return;
    setImporting(true);
    try {
      if (mode === "wipe") {
        const { error: wipeError } = await supabase.rpc("wipe_historical_codes" as any);
        if (wipeError) throw wipeError;
      }
      
      const CHUNK_SIZE = 1000;
      const finalSummary = {
        created_count: 0, updated_count: 0, skipped_count: 0, duplicate_count: 0, error_count: 0, reconciliation_count: 0, unique_rows: 0, batch_id: ""
      };

      for (let i = 0; i < mappedRows.length; i += CHUNK_SIZE) {
        setImportProgress(Math.round((i / mappedRows.length) * 100));
        const chunk = mappedRows.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase.rpc("import_historical_codes" as any, {
          _file_name: `${fileName || "historical-import"} (Part ${Math.floor(i / CHUNK_SIZE) + 1})`,
          _rows: chunk,
          _mode: mode === "wipe" ? "add" : mode,
        });
        
        if (error) throw error;
        
        finalSummary.created_count += data.created_count || 0;
        finalSummary.updated_count += data.updated_count || 0;
        finalSummary.skipped_count += data.skipped_count || 0;
        finalSummary.duplicate_count += data.duplicate_count || 0;
        finalSummary.error_count += data.error_count || 0;
        finalSummary.reconciliation_count += data.reconciliation_count || 0;
        finalSummary.unique_rows += data.unique_rows || 0;
        finalSummary.batch_id = data.batch_id || finalSummary.batch_id;
      }
      
      setImportProgress(100);
      
      setSummary(finalSummary);
      toast({ title: "Historical import complete", description: `${finalSummary.created_count} created, ${finalSummary.updated_count} updated, ${finalSummary.skipped_count} skipped.` });
      setReplaceConfirmation("");
      setReplaceDialogOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Import failed", description: error.message });
    } finally {
      setImporting(false);
    }
  };

  const startImport = () => {
    if (!importMode) return;
    setReplaceConfirmation("");
    setReplaceDialogOpen(true);
  };

  if (role !== "admin") {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-rose-500" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-sm text-slate-500">You do not have permission to view or manage historical code imports.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-12 animate-in fade-in duration-500">
      <div className="mb-6 grid gap-2 lg:grid-cols-4">
        {importModeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setImportMode(option.value)}
            className={`rounded-xl border p-3 text-left transition ${
              importMode === option.value
                ? option.value === "replace" || option.value === "wipe"
                  ? "border-rose-300 bg-rose-50"
                  : "border-emerald-300 bg-emerald-50"
                : "border-slate-100 bg-white hover:border-slate-200"
            }`}
          >
            <p className={`text-xs font-black uppercase tracking-widest ${importMode === option.value && (option.value === "replace" || option.value === "wipe") ? "text-rose-700" : "text-slate-700"}`}>{option.label}</p>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{option.description}</p>
          </button>
        ))}
      </div>

      {importMode && !file && (
        <>
          <div className="mb-6 rounded-lg bg-blue-50 p-4 border border-blue-100 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-bold mb-1">Important: Date Formatting</p>
              <p>To avoid dates like <span className="font-mono bg-blue-100 px-1 rounded">03/09/2026</span> being imported incorrectly, please ensure dates in your Excel file are formatted unambiguously before uploading. We strongly recommend formatting your date columns in Excel as <strong>YYYY-MM-DD</strong> (e.g. <span className="font-mono bg-blue-100 px-1 rounded">2026-04-09</span>) or using the exact British format <strong>DD/MM/YYYY</strong>.</p>
            </div>
          </div>
          <div 
            className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-colors duration-200 ${isDragging ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors">
              <input 
                type="checkbox" 
                checked={hasHeaders} 
                onChange={(e) => setHasHeaders(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
              />
              File has headers
            </label>
          </div>
          <Upload className={`mb-4 h-10 w-10 ${isDragging ? "text-emerald-500" : "text-slate-400"}`} />
          <h3 className="mb-1 text-lg font-semibold text-slate-900">Drag & Drop your file here</h3>
          <p className="mb-4 text-sm text-slate-500">Supports .CSV, .XLS, .XLSX (max 50MB)</p>
          <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-slate-900 px-6 text-sm font-bold text-white shrink-0 hover:bg-slate-800 transition-colors">
            Browse Files
            <Input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
          </label>
        </div>
        </>
      )}

      {importMode && file && rows.length > 0 && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Total rows", analysis.total],
              ["Unique rows", analysis.unique],
              ["Duplicate rows ignored", analysis.duplicates],
              ["Missing code errors", analysis.missing],
            ].map(([label, value]) => (
              <Card key={label} className="rounded-xl border-slate-100 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{Number(value).toLocaleString()}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="rounded-2xl border-slate-100 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    <p className="text-xs font-black uppercase tracking-widest text-slate-600 truncate max-w-[200px]">{fileName}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={hasHeaders} 
                      onChange={(e) => setHasHeaders(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                    />
                    File has headers
                  </label>
                  <Button variant="ghost" size="sm" onClick={clearFile} disabled={importing} className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Clear File
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  {importing && (
                    <div className="flex items-center gap-3 mr-2 w-[150px]">
                      <Progress value={importProgress} className="h-2 w-full bg-slate-100 [&>div]:bg-[#1A5F4A]" />
                      <span className="text-xs font-bold text-slate-500 w-8">{importProgress}%</span>
                    </div>
                  )}
                  <Button onClick={startImport} disabled={importing || analysis.unique === 0} className="h-9 rounded-lg bg-[#1A5F4A] text-sm font-medium normal-case text-white hover:bg-[#0F3D30]">
                    {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {importing ? "Processing..." : `Execute: ${importModeOptions.find((option) => option.value === importMode)?.label}`}
                  </Button>
                </div>
              </div>

              <div className="mb-4 grid gap-2 md:grid-cols-3">
                {headers.map((header) => (
                  <div key={header} className="rounded-xl border border-slate-100 bg-slate-50 p-2">
                    <p className="mb-1 truncate text-xs font-black uppercase tracking-widest text-slate-400">{header}</p>
                    <Select value={mapping[header] || "ignore"} onValueChange={(value) => setMapping({ ...mapping, [header]: value === "ignore" ? "" : value })}>
                      <SelectTrigger className="h-8 rounded-lg bg-white text-xs font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignore">Ignore</SelectItem>
                        {supportedFields.map((field) => <SelectItem key={field} value={field}>{field.replace(/_/g, " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="max-h-[360px] overflow-auto rounded-xl border border-slate-100">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="p-3">Action</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Code</th>
                      <th className="p-3">Policy</th>
                      <th className="p-3">Hospital</th>
                      <th className="p-3">Patient</th>
                      <th className="p-3">Diagnosis</th>
                      <th className="p-3">Treatment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs font-bold">
                    {mappedRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map((row, i) => {
                      const index = (currentPage - 1) * rowsPerPage + i;
                      const key = `${row.record_type}:${normalizeCode(row.original_code)}`;
                      const duplicate = mappedRows.findIndex((item) => `${item.record_type}:${normalizeCode(item.original_code)}` === key) !== index;
                      const hasMissingCrucial = !normalizeCode(row.original_code);
                      return (
                        <tr key={index} className={`hover:bg-slate-50 transition-colors ${hasMissingCrucial ? "bg-rose-50/40" : ""}`}>
                          <td className="p-3">
                            {hasMissingCrucial ? <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">Missing Code</Badge> : duplicate ? <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50">Duplicate</Badge> : <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Ready</Badge>}
                          </td>
                          <td className="p-3 uppercase text-slate-500">{row.record_type}</td>
                          <td className={`p-3 font-mono ${hasMissingCrucial ? "text-rose-600 font-bold" : "text-slate-900"}`}>{row.original_code || <span className="text-rose-400 font-medium">Required field</span>}</td>
                          <td className="p-3">{row.policy_number || "-"}</td>
                          <td className="p-3">{row.hospital_name || row.hospital_code || "-"}</td>
                          <td className="p-3">{row.patient_name || "-"}</td>
                          <td className="p-3 max-w-[200px] truncate" title={row.diagnosis}>{row.diagnosis || "-"}</td>
                          <td className="p-3 max-w-[200px] truncate" title={row.treatment}>{row.treatment || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {mappedRows.length > rowsPerPage && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium text-slate-500">
                    Showing <strong className="text-slate-900">{(currentPage - 1) * rowsPerPage + 1}</strong> to <strong className="text-slate-900">{Math.min(currentPage * rowsPerPage, mappedRows.length)}</strong> of <strong className="text-slate-900">{mappedRows.length}</strong> rows
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 shadow-sm">
                      <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(Math.ceil(mappedRows.length / rowsPerPage), p + 1))} disabled={currentPage === Math.ceil(mappedRows.length / rowsPerPage)} className="h-8 shadow-sm">
                      Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {summary && (
        <Card className="rounded-2xl border-emerald-100 bg-emerald-50 shadow-sm">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              <p className="text-xs font-black uppercase tracking-widest text-emerald-800">Import Summary</p>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              {[
                ["Created", summary.created_count],
                ["Updated", summary.updated_count],
                ["Skipped", summary.skipped_count],
                ["Duplicates", summary.duplicate_count],
                ["Errors", summary.error_count],
                ["Reconciled", summary.reconciliation_count],
                ["Unique", summary.unique_rows],
                ["Batch", String(summary.batch_id).slice(0, 8)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white p-3">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!file && rows.length === 0 && (
        <Card className="rounded-2xl border-dashed border-slate-200 bg-white shadow-sm">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center p-8 text-center">
            <AlertTriangle className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Select an action to upload a legacy code file</p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {importMode === "wipe" ? "Confirm COMPLETE DATABASE WIPE" :
               importMode === "replace" ? "Confirm historical replacement" :
               importMode === "merge" ? "Confirm missing field merge" :
               "Confirm adding new codes"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {importMode === "wipe" ? "DANGER: Wipe mode will instantly delete ALL existing historical codes before importing. Type WIPE to confirm." :
               importMode === "replace" ? "Replace mode will overwrite existing historical code fields when the uploaded file contains a new non-empty value. Type REPLACE to continue." :
               importMode === "merge" ? "Merge mode will only fill in blank fields for existing codes, and will not overwrite existing data. Type MERGE to continue." :
               "Add mode will skip any codes that already exist in the database, only inserting brand new ones. Type ADD to continue."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={replaceConfirmation}
            onChange={(event) => setReplaceConfirmation(event.target.value.toUpperCase())}
            placeholder={`Type ${importMode.toUpperCase()}`}
            autoComplete="off"
            className={importMode === "wipe" ? "border-rose-300 focus-visible:ring-rose-500" : ""}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing} onClick={() => setReplaceConfirmation("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={replaceConfirmation !== importMode.toUpperCase() || importing}
              onClick={(event) => {
                event.preventDefault();
                void runImport(importMode as ImportMode);
              }}
              className={importMode === "wipe" ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-[#1A5F4A] text-white hover:bg-[#0F3D30]"}
            >
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {importMode === "wipe" ? "WIPE & Import" : "Confirm & Import"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
