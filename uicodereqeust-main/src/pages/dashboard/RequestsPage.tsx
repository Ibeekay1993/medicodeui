import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  
  const [requests, setRequests] = useState<any[]>([]);
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(() => sessionStorage.getItem("req_search") || "");
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState(() => sessionStorage.getItem("req_status_filter") || "all");
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
  const [unlockingReqId, setUnlockingReqId] = useState<string | null>(null);
  const [unlockOtpInput, setUnlockOtpInput] = useState("");
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

  const fetchRequests = useCallback(async (page = currentPage) => {
    setIsLoading(true);
    try {
      const from = (page - 1) * rowsPerPage;
      const to = from + rowsPerPage - 1;
      let q = supabase.from("authorization_requests").select("*", { count: "exact" }).order("created_at", { ascending: false });
      if (search) q = q.or(`patient_name.ilike.%${search}%,policy_number.ilike.%${search}%,request_id.ilike.%${search}%,authorization_code.ilike.%${search}%`);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      const rows = data ?? [];
      setRequests(rows);
      setTotalCount(count ?? 0);
      const approverIds = Array.from(new Set(
        rows
          .flatMap((row: any) => [row.approved_by, row.decided_by])
          .filter(Boolean)
      ));
      if (approverIds.length) {
        const { data: users } = await supabase
          .from("user_roles")
          .select("user_id, full_name")
          .in("user_id", approverIds);
        setApproverNames(Object.fromEntries((users || []).map((item: any) => [item.user_id, item.full_name])));
      } else {
        setApproverNames({});
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: getErrorMessage(error, "Unable to load requests") });
      setRequests([]);
      setTotalCount(0);
    } finally { setIsLoading(false); }
  }, [currentPage, search, statusFilter, rowsPerPage, toast]);

  useEffect(() => { 
    if (role) fetchRequests(currentPage); 
  }, [currentPage, search, statusFilter, role, rowsPerPage, fetchRequests]);

  useTabVisibilityRefresh(() => fetchRequests(currentPage), Boolean(role));

  // Fetch OTP values and verification statuses for pending/approved requests that have patient_email
  useEffect(() => {
    if (!Array.isArray(requests) || !requests.length || !role || role === "claims") return;
    
    const requestsToFetch = requests.filter(r => {
      if (!r.patient_email) return false;
      if (otpLoading[r.id]) return false;
      
      if (role === "utilization_manager" || role === "admin") {
        return (r.status === "pending" || r.status === "approved") && !otpValues[r.id];
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
       setRequests(prev => prev.filter(r => r.id !== deleteTarget.id));
       setTotalCount(prev => Math.max(0, prev - 1));
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
        setRequests(prev => prev.map(r => r.id === deleteTarget.id ? { ...r, deletion_status: "awaiting_admin_approval", deletion_reason: deleteReason.trim() } : r));
        toast({ title: "Awaiting Admin Approval", description: "Your delete request has been sent to admin for final review." });
        setDeleteTarget(null);
        setDeleteConfirmText("");
        setDeleteReason("");
      }
    }
  };

  const statusBadge = (s: string) => {
    const key = String(s || "").toLowerCase();
    const map: Record<string, string> = {
      approved: "border-emerald-200 text-emerald-700 bg-emerald-50",
      rejected: "border-rose-200 text-rose-700 bg-rose-50",
      pending: "border-amber-200 text-amber-800 bg-amber-50",
      deferred: "border-slate-200 text-slate-700 bg-slate-50",
      "awaiting deletion approval": "border-amber-200 text-amber-800 bg-amber-50",
      "awaiting delete": "border-amber-200 text-amber-800 bg-amber-50"
    };
    return <Badge variant="outline" className={cn("rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider", map[key] || "border-slate-200 bg-slate-50 text-slate-600")}>{s}</Badge>;
  };

  const isAwaitingDelete = (r: any) => r.deletion_status === "awaiting_admin_approval";
  const displayStatus = (r: any) => isAwaitingDelete(r) ? "Awaiting Delete" : r.status;
  const rejectionReason = (r: any) => String(r.decision_reason || r.rejection_reason || r.clinical_notes || "").trim();
  const isRejected = (r: any) => ["rejected", "declined", "denied"].includes(String(r.status || "").toLowerCase());
  const codeOrDecisionText = (r: any) => {
    if (isAwaitingDelete(r)) return "Code revoked - Awaiting Delete";
    if (r.authorization_code) return r.authorization_code;
    if (isRejected(r)) return rejectionReason(r) || "Rejected - reason not recorded";
    return "Pending";
  };
  const approverLabel = (r: any) => {
    const byName = String(r.authorized_by_name || "").trim();
    if (byName) return byName;
    const byId = r.approved_by || r.decided_by;
    if (byId && approverNames[byId]) return approverNames[byId];
    const initials = String(r.nurse_initials || "").trim();
    if (initials) return `Nurse ${initials}`;
    if (String(r.status || "").toLowerCase() === "approved") return "Unknown Nurse";
    return "Unassigned";
  };

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast({ title: "Copied to clipboard" });
  };

  const handleUnlockOtp = async (r: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!unlockOtpInput) return;
    
    const { data, error } = await supabase.rpc("verify_otp" as any, {
      p_request_id: r.id,
      p_otp_plaintext: unlockOtpInput
    });
    
    if (error) {
      toast({ variant: "destructive", title: "Unlock Failed", description: error.message });
      return;
    }
    
    if (data?.verified) {
      toast({ title: "Unlocked", description: "Authorization code revealed." });
      setOtpVerifiedStatus(prev => ({ ...prev, [r.id]: true }));
      setUnlockingReqId(null);
      setUnlockOtpInput("");
    } else {
      toast({ variant: "destructive", title: "Unlock Failed", description: data?.error || "Invalid OTP" });
    }
  };

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">

      <div className="flex flex-wrap items-center gap-2 pb-3">
          <Select value={statusFilter} onValueChange={(val: any) => { setStatusFilter(val); setCurrentPage(1); }}>
            <SelectTrigger className="h-8 w-32 rounded-lg bg-slate-100 border-none text-xs font-bold">
              <SelectValue placeholder="All Status" />
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
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Search records..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="h-8 rounded-lg border-none bg-slate-100 pl-8 text-xs font-bold" />
          </div>
        </div>

      <Card className="overflow-hidden rounded-xl border-slate-100 bg-white shadow-sm">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto w-full">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="table-heading">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="px-4 py-4">Patient / Diagnosis</th>
                    <th className="px-4 py-4">Policy</th>
                    <th className="px-4 py-4">Auth Code</th>
                    {!isClaimsRole && !["hospital"].includes(role || "") && (
                      <th className="px-4 py-4">OTP</th>
                    )}
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4">Approver & SLA</th>
                    {!isClaimsRole && <th className="px-4 py-4 text-right">Action</th>}
                  </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((r) => (
                <tr key={r.id} className="cursor-pointer text-sm transition-colors hover:bg-slate-50/70" onClick={() => setSelectedRequest(r)}>
                  <td className="p-4 font-mono text-sm font-bold text-slate-500">{new Date(r.created_at).toLocaleDateString("en-GB")}</td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-black uppercase leading-snug text-slate-950">{r.patient_name}</p>
                    <p className="mt-1 max-w-[360px] text-xs font-semibold leading-snug text-slate-500">{r.diagnosis || "No diagnosis recorded"}</p>
                    {r.referred_hospital_name ? (
                      <p className="mt-2 inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black uppercase tracking-wide text-slate-700">
                        Referral To: {r.referred_hospital_name}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 font-mono text-sm font-bold text-slate-600">{r.policy_number || "-"}</td>
                  <td className="px-4 py-4">
                    {role === "hospital" && r.status === "approved" && r.patient_email && !otpVerifiedStatus[r.id] ? (
                      <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                        {unlockingReqId === r.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              autoFocus
                              value={unlockOtpInput}
                              onChange={e => setUnlockOtpInput(e.target.value)}
                              placeholder="Enter OTP"
                              className="h-8 w-24 text-xs font-mono font-bold"
                            />
                            <Button size="sm" onClick={(e) => handleUnlockOtp(r, e)} className="h-8 px-2 text-xs">Unlock</Button>
                            <Button variant="ghost" size="sm" onClick={() => setUnlockingReqId(null)} className="h-8 px-2 text-xs text-slate-400">Cancel</Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setUnlockingReqId(r.id); }} className="h-8 w-fit text-xs border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
                            🔒 Unlock Code
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className={cn("flex items-center font-mono text-sm font-black leading-snug", 
                        (isRejected(r) || isAwaitingDelete(r)) 
                          ? "max-w-[260px] text-rose-700" 
                          : r.authorization_code 
                          ? "text-slate-800" 
                          : "text-slate-500"
                      )}>
                        {codeOrDecisionText(r)}
                        {r.authorization_code && !isAwaitingDelete(r) && (
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleCopyCode(r.authorization_code); }} className="ml-2 h-8 w-8 text-slate-400 hover:text-slate-600">
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                  {!isClaimsRole && !["hospital"].includes(role || "") && (
                    <td className="px-4 py-4 font-mono text-sm font-bold">
                      {r.source === "whatsapp" || r.source === "whatsapp_parser" ? (
                        <span className="text-emerald-600 font-black" title="Verified via WhatsApp">✓</span>
                      ) : r.patient_email ? (
                        r.status === "pending" ? (
                          otpLoading[r.id] ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                          ) : otpValues[r.id] ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-amber-700 font-black tracking-wider">{otpValues[r.id]}</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(otpValues[r.id]); toast({ title: "OTP Copied" }); }} 
                                className="h-5 w-5 text-slate-400 hover:text-amber-700"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-amber-700">••••••</span>
                          )
                        ) : r.status === "approved" ? (
                          <span className="text-emerald-600 font-black">✓</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start gap-1">
                      {statusBadge(displayStatus(r))}
                      {isAwaitingDelete(r) && (
                        <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-700">Delete pending</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start gap-1.5">
                      {(() => {
                        const created = new Date(r.created_at).getTime();
                        const resolved = r.decided_at ? new Date(r.decided_at).getTime() : Date.now();
                        const diffMins = Math.round((resolved - created) / (1000 * 60));
                        const slaType = diffMins <= 15 ? "good" : diffMins <= 30 ? "warning" : "danger";
                        const timeStr = diffMins >= 60 ? `${Math.floor(diffMins / 60)}h ${diffMins % 60}m` : `${diffMins}m`;
                        const timeColor = slaType === "good" ? "text-emerald-600" : slaType === "warning" ? "text-amber-600 font-bold" : "text-rose-600 animate-pulse font-bold";
                        return (
                          <div className="flex items-center gap-2">
                            <span className={cn("text-xs font-mono font-bold min-w-fit", timeColor)}>{timeStr}</span>
                            <Badge variant="outline" className="max-w-[150px] rounded-md border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700">
                              <span className="truncate">{approverLabel(r)}</span>
                            </Badge>
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                  {!isClaimsRole && (
                    <td className="px-4 py-4 text-right">
                      {!isAwaitingDelete(r) && (
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); setDeleteTarget(r); }} className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="block md:hidden divide-y divide-slate-100">
          {requests.map((r) => (
            <div key={r.id} className="cursor-pointer space-y-3 p-4 transition-colors hover:bg-slate-50 active:bg-slate-100" onClick={() => setSelectedRequest(r)}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-sm font-black uppercase leading-tight text-slate-950">{r.patient_name}</p>
                  <p className="mt-1 text-xs font-mono font-bold text-slate-500">{r.policy_number}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {statusBadge(displayStatus(r))}
                  <span className="text-xs font-mono font-bold text-slate-400">{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
                </div>
              </div>
              <div className="flex justify-between items-end pt-1">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-xs font-semibold leading-snug text-slate-600">{r.diagnosis || "No diagnosis recorded"}</p>
                  {isRejected(r) && rejectionReason(r) && (
                    <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 p-2 text-xs font-semibold leading-snug text-rose-700">Reason: {rejectionReason(r)}</p>
                  )}
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {approverLabel(r) !== "System" && approverLabel(r) !== "Pending" && (
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#3f3f95]">
                        APPROVED BY: {approverLabel(r)}
                      </p>
                    )}

                    {(() => {
                      const created = new Date(r.created_at).getTime();
                      const resolved = r.decided_at ? new Date(r.decided_at).getTime() : Date.now();
                      const diffMins = Math.round((resolved - created) / (1000 * 60));
                      const slaType = diffMins <= 15 ? "good" : diffMins <= 30 ? "warning" : "danger";
                      const timeStr = diffMins >= 60 ? `${Math.floor(diffMins / 60)}H ${diffMins % 60}M` : `${diffMins}M`;
                      
                      const bgClass = slaType === "good" ? "bg-emerald-50" : slaType === "warning" ? "bg-amber-50" : "bg-rose-50";
                      const textClass = slaType === "good" ? "text-emerald-600" : slaType === "warning" ? "text-amber-600" : "text-rose-600";
                      const suffix = (["approved", "authorization_approved", "rejected", "authorization_rejected"].includes(r.status)) ? "TAKEN" : "ELAPSED";

                      return (
                        <div className="self-start">
                          <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", bgClass, textClass)}>
                            {timeStr} {suffix}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="mt-1 flex items-center justify-between">
                      {isAwaitingDelete(r) ? (
                        <p className="text-xs font-black text-rose-700">Code revoked - Awaiting Delete</p>
                      ) : role === "hospital" && r.status === "approved" && r.patient_email && !otpVerifiedStatus[r.id] ? (
                        <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                          {unlockingReqId === r.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                autoFocus
                                value={unlockOtpInput}
                                onChange={e => setUnlockOtpInput(e.target.value)}
                                placeholder="Enter OTP"
                                className="h-7 w-24 text-[10px] font-mono font-bold"
                              />
                              <Button size="sm" onClick={(e) => handleUnlockOtp(r, e)} className="h-7 px-2 text-[10px]">Unlock</Button>
                              <Button variant="ghost" size="sm" onClick={() => setUnlockingReqId(null)} className="h-7 px-2 text-[10px] text-slate-400">Cancel</Button>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setUnlockingReqId(r.id); }} className="h-7 w-fit text-[10px] border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
                              🔒 Unlock Code
                            </Button>
                          )}
                        </div>
                      ) : r.authorization_code ? (
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-black text-[#1D9E75]">Code: {r.authorization_code}</p>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleCopyCode(r.authorization_code); }} className="h-6 w-6 text-slate-400 hover:text-slate-600">
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div />
                      )}

                      {!isClaimsRole && !isAwaitingDelete(r) && (
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); setDeleteTarget(r); }} className="h-7 w-7 text-rose-400 hover:bg-rose-50 hover:text-rose-600 shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {requests.length === 0 && !isLoading && (
             <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
               No records found
             </div>
          )}
        </div>
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

      <ReviewModal request={selectedRequest} open={!!selectedRequest} onClose={() => setSelectedRequest(null)} onUpdated={() => fetchRequests(currentPage)} />

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
