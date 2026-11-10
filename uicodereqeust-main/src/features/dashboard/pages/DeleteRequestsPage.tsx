import { useMemo, useState } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { useDeleteQueue, useDeleteArchive, useResolveDeleteRequest } from "../hooks/useRequests";
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
  Clock,
  AlertTriangle,
  Banknote,
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
  if (["approved", "complete"].includes(normalized)) return "border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold";
  if (["rejected", "failed"].includes(normalized)) return "border-rose-300 bg-rose-50 text-rose-700 font-semibold";
  return "border-amber-300 bg-amber-50 text-amber-800 font-semibold";
};

export default function DeleteRequestsPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"queue" | "archive">("queue");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(15);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<any | null>(null);
  const { data: rows = [], isLoading: loading, refetch: refreshQueue } = useDeleteQueue();
  const { data: archiveRows = [], isLoading: loadingArchive } = useDeleteArchive();
  const { mutateAsync: resolveDelete } = useResolveDeleteRequest();
  
  useTabVisibilityRefresh(refreshQueue);

  const approveDelete = async (row: any) => {
    setActioningId(row.id);
    try {
      await resolveDelete({ id: row.id, action: "approved" });
      setConfirmDeleteTarget(null);
      toast({ title: "Deletion Approved", description: "The authorization record has been pruned." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action Failed", description: err.message || "Failed to approve deletion." });
    } finally {
      setActioningId(null);
    }
  };

  const rejectDelete = async (row: any) => {
    setActioningId(row.id);
    try {
      await resolveDelete({ id: row.id, action: "rejected" });
      toast({ title: "Deletion Rejected", description: "The request has been rejected." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action Failed", description: err.message || "Failed to reject deletion." });
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

  if (role !== "admin" && role !== "utilization_manager_lead") {
    return (
      <div className="flex h-[360px] flex-col items-center justify-center space-y-3">
        <ShieldAlert className="h-10 w-10 text-rose-500" />
        <h2 className="text-lg font-bold text-slate-800">Access Denied</h2>
        <p className="text-xs text-slate-500">Only Admins and the Utilization Manager Lead can review deletion requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8 animate-in fade-in duration-300">
      {/* Top Header Strip: Compact Metrics + Queue/Archive Switch */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200/80 px-2.5 py-1">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-slate-500 font-medium">Pending:</span>
            <span className="font-bold text-slate-900">{stats.totalCount}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200/80 px-2.5 py-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-amber-700 font-medium">Urgent:</span>
            <span className="font-bold text-amber-900">{stats.urgentCount}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200/80 px-2.5 py-1">
            <Banknote className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-emerald-700 font-medium">Ledger Risk:</span>
            <span className="font-bold font-mono text-emerald-900">{money(stats.valueAtRisk)}</span>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 items-center gap-1 rounded-lg bg-slate-100 p-1 self-end sm:inline-flex sm:h-8 sm:w-auto sm:p-0.5 sm:self-auto">
          <button 
            onClick={() => setActiveTab("queue")} 
            className={cn("min-h-11 min-w-0 rounded-md px-2 py-1 text-center text-[11px] font-bold leading-tight transition-all sm:h-full sm:min-h-0 sm:px-3 sm:text-xs", activeTab === "queue" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/70")}
          >
            Queue ({rows.length})
          </button>
          <button 
            onClick={() => setActiveTab("archive")} 
            className={cn("inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md px-2 py-1 text-center text-[11px] font-bold leading-tight transition-all sm:h-full sm:min-h-0 sm:px-3 sm:text-xs", activeTab === "archive" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/70")}
          >
            <Archive className="h-3 w-3" /> Archive
          </button>
        </div>
      </div>

      {activeTab === "queue" && (
        <>
          {/* Status Filter Toolbar */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              {["all", "pending", "approved", "rejected"].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors",
                    statusFilter === filter
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              Showing {visibleRows.length} of {filteredRows.length} requests
            </div>
          </div>

          {/* Compact Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Request ID</th>
                    <th className="px-3 py-2.5">Patient</th>
                    <th className="px-3 py-2.5">Requested By</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Reason</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-400" />
                        <span className="text-xs font-medium">Loading deletion requests...</span>
                      </td>
                    </tr>
                  ) : visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                        <FileCheck className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                        <span className="text-xs font-medium">No pending deletion requests.</span>
                      </td>
                    </tr>
                  ) : visibleRows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-800">{row.request_id || row.id}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.patient_name || "Unknown patient"}</td>
                      <td className="px-3 py-2 text-slate-600">{row.hospital_name || "Unknown"}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                        {row.deletion_requested_at 
                          ? new Date(row.deletion_requested_at).toLocaleDateString("en-GB") 
                          : row.created_at ? new Date(row.created_at).toLocaleDateString("en-GB") : "Recently"}
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-2 text-slate-600" title={row.deletion_reason || undefined}>
                        {row.deletion_reason || "No reason specified"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide", statusPill(row.deletion_status || row.status))}>
                          {row.deletion_status || row.status || "pending"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1.5">
                          <Button 
                            onClick={() => rejectDelete(row)} 
                            disabled={actioningId === row.id} 
                            variant="outline" 
                            size="sm"
                            className="h-7 rounded-md px-2 text-xs"
                          >
                            {actioningId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3 mr-1 text-rose-500" />} Reject
                          </Button>
                          <Button 
                            onClick={() => setConfirmDeleteTarget(row)} 
                            disabled={actioningId === row.id} 
                            size="sm"
                            className="h-7 rounded-md bg-rose-600 px-2 text-xs text-white hover:bg-rose-700"
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> Approve
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {filteredRows.length > visibleRows.length && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" onClick={() => setVisibleCount((current) => current + 15)} className="h-8 rounded-lg text-xs font-semibold">
                Load More Requests
              </Button>
            </div>
          )}
        </>
      )}

      {activeTab === "archive" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5">Original ID</th>
                  <th className="px-3 py-2.5">Patient</th>
                  <th className="px-3 py-2.5">Hospital</th>
                  <th className="px-3 py-2.5">Pruned On</th>
                  <th className="px-3 py-2.5">Reason</th>
                  <th className="px-3 py-2.5">Claims</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loadingArchive ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-400" />
                      <span className="text-xs font-medium">Loading archive...</span>
                    </td>
                  </tr>
                ) : archiveRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                      No authorization requests have been deleted yet.
                    </td>
                  </tr>
                ) : archiveRows.map((archive) => (
                  <tr key={archive.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-800">{archive.original_request_id || archive.authorization_code || archive.id}</td>
                    <td className="px-3 py-2 font-medium text-slate-500 line-through">{archive.patient_name}</td>
                    <td className="px-3 py-2">{archive.hospital_name || "Unknown"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Calendar className="mr-1 inline h-3 w-3 text-slate-400" /> 
                      {archive.deleted_at ? new Date(archive.deleted_at).toLocaleDateString("en-GB") : "Recently"}
                    </td>
                    <td className="max-w-[300px] truncate px-3 py-2 text-slate-600" title={archive.deletion_reason || undefined}>{archive.deletion_reason || "No reason specified"}</td>
                    <td className="px-3 py-2 font-mono">{archive.deleted_claims_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={confirmDeleteTarget !== null} onOpenChange={(open) => !open && setConfirmDeleteTarget(null)}>
        <DialogContent className="max-w-md rounded-xl bg-white p-5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-rose-700">
              <ShieldAlert className="h-5 w-5 shrink-0" /> Ledger Deletion Authorization
            </DialogTitle>
            <DialogDescription className="text-xs">
              This permanently removes the active clinical record and related claims from operational ledgers.
            </DialogDescription>
          </DialogHeader>
          {confirmDeleteTarget && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between gap-2"><span className="text-slate-500">Patient:</span><span className="font-semibold text-slate-900">{confirmDeleteTarget.patient_name}</span></div>
              <div className="flex justify-between gap-2"><span className="text-slate-500">Auth Code:</span><span className="font-mono font-semibold text-slate-800">{confirmDeleteTarget.authorization_code || confirmDeleteTarget.request_id}</span></div>
              <div className="flex justify-between gap-2"><span className="text-slate-500">Approved Value:</span><span className="font-semibold font-mono text-emerald-700">{money(confirmDeleteTarget.total_amount || 0)}</span></div>
            </div>
          )}
          <DialogFooter className="gap-2 pt-2">
            <Button onClick={() => setConfirmDeleteTarget(null)} variant="outline" size="sm" className="h-8 rounded-lg text-xs">Cancel</Button>
            <Button onClick={() => approveDelete(confirmDeleteTarget)} disabled={actioningId !== null} size="sm" className="h-8 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-xs font-semibold">
              {actioningId !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              Authorize Deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
