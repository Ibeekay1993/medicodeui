import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Loader2, Search } from "lucide-react";
import { ClaimsService } from "../services/claimsService";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HospitalSearchSelect } from "@/components/ui/HospitalSearchSelect";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const money = (value: unknown) => `NGN ${Number(value || 0).toLocaleString()}`;

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export default function ClaimsReportsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [_loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [hospitalId, setHospitalId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [reconRows, setReconRows] = useState<any[]>([]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return rows.filter((row) =>
      `${row.claim_number || ""} ${row.patient_name || ""} ${row.policy_number || ""} ${row.auth_code || ""} ${row.hospital_name || ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  const totals = useMemo(() => ({
    count: filtered.length,
    original: filtered.reduce((sum, row) => sum + Number(row.original_amount || row.total_amount || 0), 0),
    approved: filtered.reduce((sum, row) => sum + Number(row.approved_amount || 0), 0),
    declined: filtered.reduce((sum, row) => sum + Number(row.declined_amount || 0), 0),
  }), [filtered]);

  const loadHospitals = async () => {
    setLoadingHospitals(true);
    try {
      const allHospitals = await ClaimsService.getHospitalsList();
      setHospitals(allHospitals);
    } catch (error) {
      console.error("Error fetching hospitals:", error);
    } finally {
      setLoadingHospitals(false);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);
      const data = await ClaimsService.generateClaimsReportExport({
        _status: status,
        _hospital_id: hospitalId === "all" ? null : hospitalId,
        _from: startDate ? new Date(startDate).toISOString() : null,
        _to: end ? end.toISOString() : null,
      });
      setRows(data || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Claims report failed", description: error.message });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const setPresetRange = (preset: "month" | "quarter" | "year") => {
    const now = new Date();
    const start = new Date(now);
    if (preset === "month") start.setDate(1);
    if (preset === "quarter") start.setMonth(now.getMonth() - 2, 1);
    if (preset === "year") start.setMonth(0, 1);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(now.toISOString().slice(0, 10));
  };

  const loadReconciliation = async () => {
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);
    try {
      const data = await ClaimsService.generateClaimsReconciliationReport({
        _hospital_id: hospitalId === "all" ? null : hospitalId,
        _from: startDate ? new Date(startDate).toISOString() : null,
        _to: end ? end.toISOString() : null,
      });
      setReconRows(data || []);
      return data || [];
    } catch (error: any) {
      toast({ variant: "destructive", title: "Reconciliation failed", description: error.message });
      return [];
    }
  };

  useEffect(() => { loadHospitals(); }, []);
  useEffect(() => { loadReport(); }, [status, hospitalId, startDate, endDate]);

  const exportCSV = () => {
    if (filtered.length === 0) {
      toast({ variant: "destructive", title: "No claims to export", description: "Adjust the filters and try again." });
      return;
    }
    const headers = [
      "Date",
      "Submitted Date",
      "Claim Number",
      "Hospital",
      "Patient",
      "Policy Number",
      "Authorization Code",
      "Status",
      "Original Amount",
      "Approved Amount",
      "Declined Amount",
      "Current Total",
      "Payment Note",
      "Paid At",
      "Audit Note",
    ];
    const body = filtered.map((row) => [
      row.created_at ? new Date(row.created_at).toLocaleDateString("en-GB") : "",
      row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "",
      row.claim_number,
      row.hospital_name,
      row.patient_name,
      row.policy_number,
      row.auth_code,
      row.status,
      row.original_amount,
      row.approved_amount,
      row.declined_amount,
      row.total_amount,
      row.payment_note,
      row.paid_at ? new Date(row.paid_at).toLocaleString() : "",
      row.audit_note,
    ]);
    const csv = [headers, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RonsbergerHMO_Claims_Report_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportXLSX = () => {
    if (filtered.length === 0) {
      toast({ variant: "destructive", title: "No claims to export", description: "Adjust the filters and try again." });
      return;
    }
    const workbook = XLSX.utils.book_new();
    const summary = [
      ["Claims Report"],
      ["Generated", new Date().toLocaleString()],
      ["Status", status],
      ["Hospital", hospitalId === "all" ? "All Hospitals" : hospitals.find((h) => h.id === hospitalId)?.name || hospitalId],
      ["Date From", startDate || "All time"],
      ["Date To", endDate || "All time"],
      [],
      ["Claims", totals.count],
      ["Original Value", totals.original],
      ["Approved Value", totals.approved],
      ["Declined/Savings", totals.declined],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(filtered.map((row) => ({
      Date: row.created_at ? new Date(row.created_at).toLocaleDateString("en-GB") : "",
      "Submitted Date": row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "",
      "Claim Number": row.claim_number,
      Hospital: row.hospital_name,
      Patient: row.patient_name,
      "Policy Number": row.policy_number,
      "Authorization Code": row.auth_code,
      Status: row.status,
      "Original Amount": row.original_amount,
      "Approved Amount": row.approved_amount,
      "Declined Amount": row.declined_amount,
      "Current Total": row.total_amount,
      "Payment Reference": row.payment_reference,
      "Paid At": row.paid_at ? new Date(row.paid_at).toLocaleString() : "",
      "Audit Note": row.audit_note,
    }))), "Claims");
    XLSX.writeFile(workbook, `RonsbergerHMO_Claims_Report_${Date.now()}.xlsx`);
  };

  const exportReconciliationXLSX = async () => {
    const rows = reconRows.length ? reconRows : await loadReconciliation();
    if (rows.length === 0) {
      toast({ variant: "destructive", title: "No reconciliation data", description: "No matched authorization, claim, or payment rows were found." });
      return;
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.map((row: any) => ({
      Hospital: row.hospital_name,
      Patient: row.patient_name,
      "Policy Number": row.policy_number,
      "Authorization Code": row.auth_code,
      "Authorized Amount": row.authorized_amount,
      "Claim Number": row.claim_number,
      "Claimed Amount": row.claimed_amount,
      "Approved Amount": row.approved_amount,
      "Paid Amount": row.paid_amount,
      "Outstanding Balance": row.outstanding_balance,
      Status: row.claim_status,
    }))), "Reconciliation");
    XLSX.writeFile(workbook, `RonsbergerHMO_Claims_Reconciliation_${Date.now()}.xlsx`);
  };



  return (
    <div className="space-y-4 pb-10">
      <div className="pb-3 border-b border-slate-200 flex justify-end gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 rounded-lg bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 flex items-center gap-1.5 shadow-sm">
              <Download className="h-3.5 w-3.5" /> Export / Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg border border-slate-150 bg-white p-1 z-50">
            <DropdownMenuItem onClick={exportCSV} className="rounded-lg text-xs font-semibold cursor-pointer py-2 hover:bg-slate-50 transition-colors">
              Download CSV (Claims)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportXLSX} className="rounded-lg text-xs font-semibold cursor-pointer py-2 hover:bg-slate-50 transition-colors">
              Download Excel (Claims)
            </DropdownMenuItem>
            <div className="h-px bg-slate-100 my-1" />
            <DropdownMenuItem onClick={exportReconciliationXLSX} className="rounded-lg text-xs font-semibold cursor-pointer py-2 hover:bg-slate-50 hover:text-emerald-700 transition-colors">
              Reconciliation Report (Excel)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="rounded-2xl border-slate-100 bg-white shadow-sm relative z-[100]">
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-300" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search claim, patient, policy, auth code..." className="h-10 rounded-xl border-none bg-slate-50 pl-10 text-xs font-semibold" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 rounded-xl border-none bg-slate-50 text-xs font-semibold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "submitted", "under_review", "approved", "partially_approved", "paid", "rejected", "contested"].map((item) => (
                <SelectItem key={item} value={item}>{item.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <HospitalSearchSelect
            uniqueHospitals={hospitals}
            selectedHospitalId={hospitalId}
            onHospitalChange={setHospitalId}
            placeholder="Hospital"
            className="w-full h-10 rounded-xl bg-slate-50 text-xs font-semibold"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 rounded-xl border-none bg-slate-50 text-xs font-semibold" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10 rounded-xl border-none bg-slate-50 text-xs font-semibold" />
          </div>
          <div className="flex gap-2 md:col-span-5">
            <Button type="button" variant="outline" onClick={() => setPresetRange("month")} className="h-8 rounded-lg text-xs font-semibold">This Month</Button>
            <Button type="button" variant="outline" onClick={() => setPresetRange("quarter")} className="h-8 rounded-lg text-xs font-semibold">Quarter</Button>
            <Button type="button" variant="outline" onClick={() => setPresetRange("year")} className="h-8 rounded-lg text-xs font-semibold">Year</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-4">
        {[
          ["Claims", totals.count],
          ["Original Value", money(totals.original)],
          ["Approved Value", money(totals.approved)],
          ["Declined/Savings", money(totals.declined)],
        ].map(([label, value]) => (
          <Card key={label} className="rounded-xl border-slate-100 bg-white shadow-sm">
            <CardContent className="p-2 sm:p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 truncate">{label}</p>
              <p className="mt-1 text-base sm:text-lg font-extrabold text-slate-900 truncate leading-none">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
