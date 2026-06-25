import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

type ImportMode = "add" | "merge" | "replace";

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
    description: "Creates new codes and skips anything already in the database.",
  },
  {
    value: "replace",
    label: "Replace existing values",
    description: "Creates new codes and overwrites existing fields when the upload has a value.",
  },
];

const guessField = (header: string) => {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (supportedFields.includes(normalized)) return normalized;
  if (normalized.includes("auth")) return "authorization_code";
  if (normalized.includes("claim")) return "claim_number";
  if (normalized.includes("policy")) return "policy_number";
  if (normalized.includes("beneficiary") || normalized.includes("enrollee")) return "beneficiary_code";
  if (normalized.includes("hospital")) return normalized.includes("name") ? "hospital_name" : "hospital_code";
  if (normalized.includes("payment")) return "payment_reference";
  if (normalized === "code" || normalized.includes("legacy_code")) return "original_code";
  return "";
};

const normalizeCode = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();

export default function HistoricalCodeImportPage() {
  const { toast } = useToast();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [replaceConfirmation, setReplaceConfirmation] = useState("");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);

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

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setSummary(null);
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false });
    const parsedHeaders = parsed[0] ? Object.keys(parsed[0]) : [];
    setHeaders(parsedHeaders);
    setRows(parsed);
    setMapping(Object.fromEntries(parsedHeaders.map((header) => [header, guessField(header)])));
  };

  const runImport = async (mode: ImportMode = importMode) => {
    if (mappedRows.length === 0) return;
    setImporting(true);
    try {
      const CHUNK_SIZE = 1000;
      const finalSummary = {
        created_count: 0, updated_count: 0, skipped_count: 0, duplicate_count: 0, error_count: 0, reconciliation_count: 0, unique_rows: 0, batch_id: ""
      };

      for (let i = 0; i < mappedRows.length; i += CHUNK_SIZE) {
        const chunk = mappedRows.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase.rpc("import_historical_codes" as any, {
          _file_name: `${fileName || "historical-import"} (Part ${Math.floor(i / CHUNK_SIZE) + 1})`,
          _rows: chunk,
          _mode: mode,
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
    if (importMode === "replace") {
      setReplaceConfirmation("");
      setReplaceDialogOpen(true);
      return;
    }
    void runImport(importMode);
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="pb-3 border-b border-slate-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-bold text-white shrink-0">
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload CSV/XLSX
            <Input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
          </label>
        </div>
      </div>

      {rows.length > 0 && (
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
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">{fileName}</p>
                </div>
                <Button onClick={startImport} disabled={importing || analysis.unique === 0} className="h-9 rounded-lg bg-[#1A5F4A] text-sm font-medium normal-case text-white hover:bg-[#0F3D30]">
                  {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {importModeOptions.find((option) => option.value === importMode)?.label}
                </Button>
              </div>

              <div className="mb-4 grid gap-2 lg:grid-cols-3">
                {importModeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setImportMode(option.value)}
                    className={`rounded-xl border p-3 text-left transition ${
                      importMode === option.value
                        ? option.value === "replace"
                          ? "border-rose-300 bg-rose-50"
                          : "border-emerald-300 bg-emerald-50"
                        : "border-slate-100 bg-white hover:border-slate-200"
                    }`}
                  >
                    <p className={`text-xs font-black uppercase tracking-widest ${option.value === "replace" ? "text-rose-700" : "text-slate-700"}`}>{option.label}</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{option.description}</p>
                  </button>
                ))}
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs font-bold">
                    {mappedRows.slice(0, 100).map((row, index) => {
                      const key = `${row.record_type}:${normalizeCode(row.original_code)}`;
                      const duplicate = mappedRows.findIndex((item) => `${item.record_type}:${normalizeCode(item.original_code)}` === key) !== index;
                      return (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="p-3">
                            {!normalizeCode(row.original_code) ? <Badge className="bg-rose-50 text-rose-700">Error</Badge> : duplicate ? <Badge className="bg-amber-50 text-amber-700">Duplicate</Badge> : <Badge className="bg-emerald-50 text-emerald-700">Ready</Badge>}
                          </td>
                          <td className="p-3 uppercase text-slate-500">{row.record_type}</td>
                          <td className="p-3 font-mono text-slate-900">{row.original_code}</td>
                          <td className="p-3">{row.policy_number || "-"}</td>
                          <td className="p-3">{row.hospital_name || row.hospital_code || "-"}</td>
                          <td className="p-3">{row.patient_name || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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

      {rows.length === 0 && (
        <Card className="rounded-2xl border-dashed border-slate-200 bg-white shadow-sm">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center p-8 text-center">
            <AlertTriangle className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Upload a legacy code file to begin reconciliation</p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm historical replacement</AlertDialogTitle>
            <AlertDialogDescription>
              Replace mode will overwrite existing historical code fields when the uploaded file contains a new non-empty value. Type replace to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={replaceConfirmation}
            onChange={(event) => setReplaceConfirmation(event.target.value)}
            placeholder="Type replace"
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing} onClick={() => setReplaceConfirmation("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={replaceConfirmation.trim().toLowerCase() !== "replace" || importing}
              onClick={(event) => {
                event.preventDefault();
                void runImport("replace");
              }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Replace records
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
