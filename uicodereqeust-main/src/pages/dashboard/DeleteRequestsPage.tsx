import { useCallback, useEffect, useMemo, useState } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Archive,
  Calendar,
  CheckCircle2,
  FileCheck,
  Loader2,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value || 0);

const statusPill = (status?: string | null) => {
  const normalized = String(status || "pending").toLowerCase();
  if (["approved", "complete"].includes(normalized)) return "border-[#5DCAA5] bg-[#E1F5EE] text-[#93c34b]";
  if (["rejected", "failed"].includes(normalized)) return "border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]";
  return "border-[#EF9F27] bg-[#FAEEDA] text-[#854F0B]";
};

export default function DeleteRequestsPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"queue" | "archive">("queue");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(10);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [archiveRows, setArchiveRows] = useState<any[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<any | null>(null);

  const refreshQueue = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("authorization_requests")
      .select("*")
      .eq("deletion_status", "awaiting_admin_approval")
      .order("deletion_requested_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ variant: "destructive", title: "Unable to load delete requests", description: error.message });
      return;
    }
    setRows(data || []);
  }, [toast]);

  useTabVisibilityRefresh(refreshQueue);

  const refreshArchive = async () => {
    setLoadingArchive(true);
    try {
      const { data, error } = await supabase
        .from("archived_deleted_authorizations" as any)
        .select("*")
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      setArchiveRows(data || []);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Unable to load pruned archive", description: e.message });
    } finally {
      setLoadingArchive(false);
    }
  };

  useEffect(() => {
    setVisibleCount(10);
    if (activeTab === "queue") refreshQueue();
    else refreshArchive();
  }, [activeTab, refreshQueue]);

  const approveDelete = async (row: any) => {
    setActioningId(row.id);
    try {
      const { data, error } = await supabase.rpc("permanently_delete_authorization" as any, { _request_id: row.id });
      if (error) throw error;
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      toast({ title: "Clinical Record Purged", description: `Authorization and ${(data as any)?.deleted_claims || 0} related claims pruned from ledger.` });
      setConfirmDeleteTarget(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action failed", description: err.message });
    } finally {
      setActioningId(null);
    }
  };

  const rejectDelete = async (row: any) => {
    setActioningId(row.id);
    try {
      const { error } = await supabase
        .from("authorization_requests")
        .update({ deletion_status: "rejected" } as any)
        .eq("id", row.id);
      if (error) throw error;
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      toast({ title: "Deletion Request Rejected", description: "Authorization restored to active queue." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action failed", description: err.message });
    } finally {
      setActioningId(null);
    }
  };

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "pending") return String(row.deletion_status || row.status || "pending").toLowerCase().includes("pending") || String(row.deletion_status || "").includes("awaiting");
    return String(row.deletion_status || row.status || "").toLowerCase().includes(statusFilter);
  }), [rows, statusFilter]);

  const visibleRows = filteredRows.slice(0, visibleCount);
  const stats = useMemo(() => ({
    totalCount: rows.length,
    urgentCount: rows.filter((row) => ["emergency", "urgent"].includes(String(row.urgency || "").toLowerCase())).length,
    valueAtRisk: rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
  }), [rows]);

  if (role !== "admin") {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-rose-500" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-sm text-slate-500">You do not have permission to view deletion requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-500">
      <div className="pb-3 border-b border-slate-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setActiveTab("queue")} className={cn("rounded-lg px-3 py-1 text-xs font-semibold transition", activeTab === "queue" ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100")}>
              Queue {loading ? (
                <Loader2 className="inline-block h-3 w-3 animate-spin ml-1 text-current" />
              ) : (
                `(${rows.length})`
              )}
            </button>
            <button onClick={() => setActiveTab("archive")} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition", activeTab === "archive" ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100")}><Archive className="h-3.5 w-3.5" /> Archive</button>
          </div>
        </div>
      </div>

      {activeTab === "queue" && (
        <>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
            {([
              ["Pending Purges", stats.totalCount],
              ["High Urgency", stats.urgentCount],
              ["Claims Ledger Risk", money(stats.valueAtRisk)],
            ] as [string, any][]).map(([label, value]) => (
              <div key={label} className="premium-card p-2 sm:p-4 flex flex-col justify-center min-w-0 text-center sm:text-left rounded-xl" title={label}>
                <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight mb-0.5 sm:mb-1.5 line-clamp-2">{label as string}</p>
                <p className="text-sm sm:text-lg font-extrabold tabular-nums leading-none truncate text-slate-900 mt-0.5">
                  {value as any}
                </p>
              </div>
            ))}
          </div>

          <div className="med-card p-3">
            <div className="flex flex-wrap gap-2">
              {["all", "pending", "approved", "rejected"].map((filter) => (
                <button key={filter} onClick={() => setStatusFilter(filter)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition", statusFilter === filter ? "bg-[#93c34b] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100")}>{filter}</button>
              ))}
            </div>
          </div>

          <div className="med-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead className="bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  <tr>
                    <th className="px-4 py-3">Request ID</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Requested By</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[#E24B4A]" /> Loading delete requests...</td></tr>
                  ) : visibleRows.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500"><FileCheck className="mx-auto mb-3 h-7 w-7 text-slate-300" /> No pending deletion requests.</td></tr>
                  ) : visibleRows.map((row) => (
                    <tr key={row.id} className="h-12 transition hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.request_id || row.id}</td>
                      <td className="px-4 py-3 font-medium text-[#1E293B]">{row.patient_name || "Unknown patient"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.deletion_requested_by_name || row.hospital_name || "Unknown"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.deletion_requested_at ? new Date(row.deletion_requested_at).toLocaleDateString("en-GB") : row.created_at ? new Date(row.created_at).toLocaleDateString("en-GB") : "Recently"}</td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-slate-600">{row.deletion_reason || "No reason specified"}</td>
                      <td className="px-4 py-3"><span className={cn("med-status-pill", statusPill(row.deletion_status || row.status))}>{row.deletion_status || row.status || "pending"}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button onClick={() => rejectDelete(row)} disabled={actioningId === row.id} variant="outline" className="h-8 rounded-lg px-3 text-sm">{actioningId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Reject</Button>
                          <Button onClick={() => setConfirmDeleteTarget(row)} disabled={actioningId === row.id} className="h-8 rounded-lg bg-[#E24B4A] px-3 text-sm text-white hover:bg-[#A32D2D]"><Trash2 className="h-4 w-4" /> Approve</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {filteredRows.length > visibleRows.length && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setVisibleCount((current) => current + 10)} className="rounded-lg">Load More</Button>
            </div>
          )}
        </>
      )}

      {activeTab === "archive" && (
        <div className="med-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                <tr>
                  <th className="px-4 py-3">Original ID</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Hospital</th>
                  <th className="px-4 py-3">Pruned On</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Claims</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {loadingArchive ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" /> Loading archive...</td></tr>
                ) : archiveRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No authorization requests have been deleted yet.</td></tr>
                ) : archiveRows.map((archive) => (
                  <tr key={archive.id} className="h-12">
                    <td className="px-4 py-3 font-mono text-xs">{archive.original_request_id || archive.authorization_code || archive.id}</td>
                    <td className="px-4 py-3 font-medium text-slate-500 line-through">{archive.patient_name}</td>
                    <td className="px-4 py-3">{archive.hospital_name || "Unknown"}</td>
                    <td className="px-4 py-3"><Calendar className="mr-1 inline h-4 w-4 text-slate-400" /> {archive.deleted_at ? new Date(archive.deleted_at).toLocaleDateString("en-GB") : "Recently"}</td>
                    <td className="max-w-[320px] truncate px-4 py-3 text-slate-600">{archive.deletion_reason || "No reason specified"}</td>
                    <td className="px-4 py-3">{archive.deleted_claims_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={confirmDeleteTarget !== null} onOpenChange={(open) => !open && setConfirmDeleteTarget(null)}>
        <DialogContent className="max-w-md rounded-xl bg-white p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-[#A32D2D]"><ShieldAlert className="h-5 w-5" /> Ledger Deletion Authorization</DialogTitle>
            <DialogDescription>This permanently removes the active clinical record and related claims from operational ledgers.</DialogDescription>
          </DialogHeader>
          {confirmDeleteTarget && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Patient</span><span className="font-semibold">{confirmDeleteTarget.patient_name}</span></div>
              <div className="mt-2 flex justify-between gap-3"><span className="text-slate-500">Auth Code</span><span className="font-mono font-semibold">{confirmDeleteTarget.authorization_code || confirmDeleteTarget.request_id}</span></div>
              <div className="mt-2 flex justify-between gap-3"><span className="text-slate-500">Approved Value</span><span className="font-semibold text-[#93c34b]">{money(confirmDeleteTarget.total_amount || 0)}</span></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button onClick={() => setConfirmDeleteTarget(null)} variant="outline" className="rounded-lg">Cancel</Button>
            <Button onClick={() => approveDelete(confirmDeleteTarget)} disabled={actioningId !== null} className="rounded-lg bg-[#E24B4A] text-white hover:bg-[#A32D2D]">
              {actioningId !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Authorize Deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
