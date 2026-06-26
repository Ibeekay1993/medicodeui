import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { RequestList } from "@/components/dashboard/requests/RequestList";

type RequestRow = Database["public"]["Tables"]["authorization_requests"]["Row"];
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Trash2, Loader2, Copy } from "lucide-react";
import { ReviewModal } from "@/components/dashboard/ReviewModal";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";

export default function RequestsPage() {
  const { role, user } = useAuth();
  const isClaimsRole = role === "claims";
  
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(() => sessionStorage.getItem("req_search") || "");
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState(() => sessionStorage.getItem("req_status_filter") || "action_required");
  const [dateFilter, _setDateFilter] = useState(() => sessionStorage.getItem("req_date_filter") || "all");
  const [currentPage, setCurrentPage] = useState(() => {
    const val = sessionStorage.getItem("req_page");
    return val ? parseInt(val, 10) : 1;
  });
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [_deleteProcessing, setDeleteProcessing] = useState(false);
  const [otpValues, setOtpValues] = useState<Record<string, string>>({});
  const [otpLoading, setOtpLoading] = useState<Record<string, boolean>>({});
  const [otpVerifiedStatus, setOtpVerifiedStatus] = useState<Record<string, boolean>>({});
  const isMobile = useIsMobile();
  const rowsPerPage = isMobile ? 30 : 50;
  const { toast } = useToast();

  useEffect(() => {
    sessionStorage.setItem("req_search", search);
  }, [search]);

  useEffect(() => {
    sessionStorage.setItem("req_status_filter", statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    sessionStorage.setItem("req_date_filter", dateFilter);
  }, [dateFilter]);

  useEffect(() => {
    sessionStorage.setItem("req_page", String(currentPage));
  }, [currentPage]);

  const { data, isLoading, refetch: fetchRequests } = useQuery({
    queryKey: ["requests", currentPage, search, statusFilter, rowsPerPage, role],
    enabled: Boolean(role),
    queryFn: async () => {
      const from = (currentPage - 1) * rowsPerPage;
      const to = from + rowsPerPage - 1;
      let q = supabase.from("authorization_requests").select("*", { count: "exact" }).order("created_at", { ascending: false });
      if (search) q = q.or(`patient_name.ilike.%${search}%,policy_number.ilike.%${search}%,request_id.ilike.%${search}%,authorization_code.ilike.%${search}%`);
      if (statusFilter === "action_required") {
        q = q.in("status", ["pending", "pending_referral", "info_provided"]);
      } else if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }
      const { data: rowsData, error, count } = await q.range(from, to);
      if (error) {
        toast({ variant: "destructive", title: "Error", description: getErrorMessage(error, "Unable to load requests") });
        throw error;
      }
      const rows = (rowsData || []) as RequestRow[];
      
      const approverIds = Array.from(new Set(
        rows
          .flatMap((row: any) => [row.approved_by, row.decided_by])
          .filter(Boolean)
      ));
      
      let names: Record<string, string> = {};
      if (approverIds.length > 0) {
        const { data: users } = await supabase
          .from("user_roles")
          .select("user_id, full_name")
          .in("user_id", approverIds);
        names = Object.fromEntries((users || []).map((item: any) => [item.user_id, item.full_name]));
      }

      return { rows, count: count ?? 0, approverNames: names };
    }
  });

  const requests = useMemo(() => {
    const raw = data?.rows || [];
    if (statusFilter !== "all") return raw;
    const pendingStatuses = ["pending", "pending_referral", "pending_authorization", "info_provided"];
    return [...raw].sort((a, b) => {
      const aPending = pendingStatuses.includes(a.status);
      const bPending = pendingStatuses.includes(b.status);
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;
      return 0;
    });
  }, [data?.rows, statusFilter]);
  const totalCount = data?.count || 0;
  const approverNames = data?.approverNames || {};

  useTabVisibilityRefresh(() => fetchRequests());

  // Fetch OTP values and verification statuses for pending/approved requests that have patient_email
  useEffect(() => {
    if (!Array.isArray(requests) || !requests.length || !role || role === "claims") return;
    
    const requestsToFetch = requests.filter(r => {
      if (otpLoading[r.id]) return false;
      
      if (role === "utilization_manager" || role === "admin") {
        return ["pending", "pending_referral", "pending_authorization", "info_provided", "approved"].includes(r.status) && !otpValues[r.id];
      }
      
      if (role === "hospital") {
        return r.status === "approved" && otpVerifiedStatus[r.id] === undefined;
      }
      
      return false;
    });
    
    if (requestsToFetch.length === 0) return;
    
    const fetchOtps = async () => {
      const updates: Record<string, boolean> = {};
      requestsToFetch.forEach(r => updates[r.id] = true);
      setOtpLoading(prev => ({ ...prev, ...updates }));

      try {
        if (role === "utilization_manager" || role === "admin") {
          const ids = requestsToFetch.map(r => r.id);
          const { data, error } = await supabase.rpc("get_otp_values_batch" as any, {
            p_request_ids: ids,
          });

          if (!error && data && Array.isArray(data)) {
            const newValues: Record<string, string> = {};
            data.forEach((row: any) => {
              if (row.otp_value && row.authorization_id) {
                newValues[row.authorization_id] = row.otp_value;
              }
            });
            if (Object.keys(newValues).length > 0) {
              setOtpValues(prev => ({ ...prev, ...newValues }));
            }
            return;
          }
        }
        
        // Fallback for batch fetch failure, OR normal execution for hospitals
        await Promise.all(
          requestsToFetch.map(async (r) => {
            try {
              const { data, error } = await supabase.rpc("get_otp_value" as any, {
                p_request_id: r.id,
              });
              if (!error && data) {
                const otpRow = Array.isArray(data) ? data[0] : data;
                if (otpRow) {
                  if (role === "utilization_manager" || role === "admin") {
                    if (otpRow.otp_value) {
                      setOtpValues(prev => ({ ...prev, [r.id]: otpRow.otp_value }));
                    }
                  } else if (role === "hospital") {
                    setOtpVerifiedStatus(prev => ({ 
                      ...prev, 
                      [r.id]: otpRow.verified || !!otpRow.consumed_at 
                    }));
                  }
                }
              }
            } catch {
              // Silently fail individual fetch
            }
          })
        );
      } finally {
        const loadingReset: Record<string, boolean> = {};
        requestsToFetch.forEach(r => loadingReset[r.id] = false);
        setOtpLoading(prev => ({ ...prev, ...loadingReset }));
      }
    };
    
    fetchOtps().catch((err) => console.error("fetchOtps error:", err));
  }, [requests, role, otpValues, otpVerifiedStatus]);

  const executeDelete = async () => {
    if (!deleteTarget || deleteConfirmText.trim() !== "DELETE") return;
    if (role !== "admin" && !deleteReason.trim()) {
      toast({ variant: "destructive", title: "Reason required", description: "Enter the reason for requesting deletion." });
      return;
    }
    setDeleteProcessing(true);


    if (role === "admin") {
      const { data, error } = await supabase.rpc("permanently_delete_authorization" as any, { _request_id: deleteTarget.id });
      setDeleteProcessing(false);
      if (error) {
       toast({ variant: "destructive", title: "Delete failed", description: error.message });
      } else {
       queryClient.invalidateQueries({ queryKey: ["requests"] });
       toast({ title: "Permanently Deleted", description: `${(data as any)?.deleted_claims || 0} related claim record(s) removed.` });
       setDeleteTarget(null);
       setDeleteConfirmText("");
       setDeleteReason("");
      }
    } else {
      const { error } = await (supabase as any)
        .from("authorization_requests")
        .update({
          deletion_status: "awaiting_admin_approval",
          deletion_requested_at: new Date().toISOString(),
          deletion_requested_by: user?.id,
          deletion_reason: deleteReason.trim()
        })
        .eq("id", deleteTarget.id)
        .neq("deletion_status", "awaiting_admin_approval");
      setDeleteProcessing(false);
      if (error) {
        toast({ variant: "destructive", title: "Delete request failed", description: error.message });
      } else {
        queryClient.invalidateQueries({ queryKey: ["requests"] });
        toast({ title: "Awaiting Admin Approval", description: "Your delete request has been sent to admin for final review." });
        setDeleteTarget(null);
        setDeleteConfirmText("");
        setDeleteReason("");
      }
    }
  };


  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">

      <div className="flex flex-wrap items-center gap-2 pb-3">
          <Tabs value={statusFilter === 'action_required' ? 'action_required' : 'all'} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }} className="w-auto">
            <TabsList className="h-9">
              <TabsTrigger value="action_required" className="text-xs font-bold px-4">Action Needed</TabsTrigger>
              <TabsTrigger value="all" className="text-xs font-bold px-4">All Requests</TabsTrigger>
            </TabsList>
          </Tabs>

          {statusFilter !== 'action_required' && (
            <Select value={statusFilter} onValueChange={(val: any) => { setStatusFilter(val); setCurrentPage(1); }}>
              <SelectTrigger className="h-9 w-36 rounded-lg bg-slate-100 border-none text-xs font-bold">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="pending_referral">Pending Referral</SelectItem>
                <SelectItem value="referral_approved">Referral Approved</SelectItem>
                <SelectItem value="referral_accepted">Referral Accepted</SelectItem>
                <SelectItem value="pending_authorization">Pending Authorization</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="referral_declined">Referral Declined</SelectItem>
                <SelectItem value="referral_expired">Referral Expired</SelectItem>
                <SelectItem value="deferred">Deferred</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Search records..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="h-8 rounded-lg border-none bg-slate-100 pl-8 text-xs font-bold" />
          </div>
        </div>

      <Card className="overflow-hidden rounded-xl border-slate-100 bg-white shadow-sm">
        <RequestList 
          requests={requests}
          role={role}
          isClaimsRole={isClaimsRole}
          approverNames={approverNames}
          otpValues={otpValues}
          otpLoading={otpLoading}
          otpVerifiedStatus={otpVerifiedStatus}
          onSelectRequest={setSelectedRequest}
          onDeleteRequest={setDeleteTarget}
          setOtpVerifiedStatus={setOtpVerifiedStatus}
        />
        {requests.length === 0 && !isLoading && (
          <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            No records found
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between px-2">
        <p className="text-xs font-bold text-slate-500">
          Showing {Math.min((currentPage - 1) * rowsPerPage + 1, totalCount)} to {Math.min(currentPage * rowsPerPage, totalCount)} of {totalCount}
        </p>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading} className="h-7 px-3 text-xs rounded-lg">Prev</Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage * rowsPerPage >= totalCount || isLoading} className="h-7 px-3 text-xs rounded-lg">Next</Button>
        </div>
      </div>

      <ReviewModal 
        request={selectedRequest} 
        open={!!selectedRequest} 
        onClose={() => setSelectedRequest(null)} 
        onUpdated={() => fetchRequests(currentPage)} 
        otpValue={selectedRequest ? otpValues[selectedRequest.id] : undefined}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader><AlertDialogTitle>{role === "admin" ? "Delete Record?" : "Request Record Deletion?"}</AlertDialogTitle><AlertDialogDescription>{role === "admin" ? "This action is immutable." : "This will send the request to admin for final deletion approval."} Type <span className="font-black">DELETE</span>.</AlertDialogDescription></AlertDialogHeader>
          <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className="h-10 rounded-xl" />
          {role !== "admin" && (
            <div className="space-y-1">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Reason for delete request</Label>
              <Input value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="Explain why this should be deleted..." className="h-10 rounded-xl" />
            </div>
          )}
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel><AlertDialogAction disabled={deleteConfirmText !== "DELETE"} onClick={executeDelete} className="rounded-xl bg-rose-600">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
