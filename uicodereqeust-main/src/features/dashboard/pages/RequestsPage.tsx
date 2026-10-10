import { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { RequestList } from "@/components/dashboard/requests/RequestList";

type RequestRow = Database["public"]["Tables"]["authorization_requests"]["Row"];
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { ReviewModal } from "@/components/dashboard/ReviewModal";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function RequestsPage() {
  const { role } = useAuth();
  const isClaimsRole = role === "claims";
  const isDeleteApprover = role === "admin" || role === "utilization_manager_lead";
  
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const reviewIdFromUrl = searchParams.get("review");
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
  const [deleteProcessing, setDeleteProcessing] = useState(false);
  const [otpValues, setOtpValues] = useState<Record<string, string>>({});
  const [otpLoading, setOtpLoading] = useState<Record<string, boolean>>({});
  const [otpVerifiedStatus, setOtpVerifiedStatus] = useState<Record<string, boolean>>({});
  // Tracks IDs already fetched this session — prevents the OTP effect from re-fetching
  // every time otpValues / otpVerifiedStatus state updates (which previously caused an infinite loop).
  const fetchedOtpIdsRef = useRef<Set<string>>(new Set());
  const requestLoadGenerationRef = useRef(0);
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

  const { data, isLoading, isError, error, refetch: fetchRequests } = useQuery({
    queryKey: ["requests", currentPage, search, statusFilter, rowsPerPage, role],
    // Load the visible queue on mount so it remains available after closing a request.
    // Avoid realtime subscriptions. Refresh the visible request queue at a modest
    // cadence so new WhatsApp requests appear without keeping a CDC connection open.
    enabled: Boolean(role),
    refetchInterval: () => (document.visibilityState === "visible" ? 60_000 : false),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000, // treat data as fresh for 30 s — avoids redundant refetch if modal closes quickly
    queryFn: async () => {
      const from = (currentPage - 1) * rowsPerPage;
      // Pull one extra row to support Next without forcing a full-table exact count.
      const to = from + rowsPerPage;
      let q = supabase
        .from("authorization_requests")
        // Only list fields are loaded here; request details load on demand in the modal.
        .select("id,request_id,patient_name,policy_number,diagnosis,status,source,hospital_name,requesting_hospital_name,referred_hospital_name,authorization_code,urgency,created_at,updated_at,decided_at,treatment_submitted_at,approved_by,decided_by,nurse_initials,authorized_by_name,authorized_by_email,claiming_hospital_name,referring_hospital_name,is_historical,is_unlocked,deletion_status,patient_phone,patient_email,hospital_id,requesting_hospital_id,referred_hospital_id,claiming_hospital_id,approved_items")
        // created_at has a production index. Sorting all 75k+ requests by updated_at
        // caused PostgreSQL to choose a sequential scan and sort before applying LIMIT.
        .order("created_at", { ascending: false });
      if (search) q = q.or(`patient_name.ilike.%${search}%,policy_number.ilike.%${search}%,request_id.ilike.%${search}%,authorization_code.ilike.%${search}%`);
      if (statusFilter === "action_required") {
        q = q.in("status", ["pending", "pending_referral", "pending_authorization", "info_provided"]);
      } else if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }
      const { data: rowsData, error } = await q.range(from, to);
      if (error) {
        toast({ variant: "destructive", title: "Error", description: getErrorMessage(error, "Unable to load requests") });
        throw error;
      }
      const fetchedRows = rowsData || [];
      const hasMore = fetchedRows.length > rowsPerPage;
      const rows = fetchedRows.slice(0, rowsPerPage);
      
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

      return { rows, hasMore, approverNames: names };
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
  const hasMore = data?.hasMore ?? false;
  const visibleStart = requests.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const visibleEnd = (currentPage - 1) * rowsPerPage + requests.length;
  const approverNames = data?.approverNames || {};

  // Synchronize review modal with URL (?review=<id>) so modal survives browser refresh
  useEffect(() => {
    if (!reviewIdFromUrl) {
      if (selectedRequest) setSelectedRequest(null);
      return;
    }
    if (selectedRequest?.id === reviewIdFromUrl) return;

    let cancelled = false;
    supabase
      .from("authorization_requests")
      .select("*")
      .eq("id", reviewIdFromUrl)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast({
            variant: "destructive",
            title: "Unable to open request",
            description: getErrorMessage(error, "Could not load the full authorization record."),
          });
          return;
        }
        if (!data) {
          toast({
            variant: "destructive",
            title: "Request not found",
            description: "The authorization record could not be found.",
          });
          return;
        }
        setSelectedRequest(data);
      });
    return () => { cancelled = true; };
  }, [reviewIdFromUrl, selectedRequest?.id, toast]);

  const handleSelectRequest = (r: any) => {
    const requestLoadGeneration = ++requestLoadGenerationRef.current;
    // 1. Open the modal immediately with the lightweight row — fast, no spinner.
    setSelectedRequest(r);
    if (r?.id) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("review", r.id);
        return next;
      }, { replace: true });

      // 2. Immediately fetch the full row (select *) in the background for secondary details.
      //    approved_items is included in the queue query so saved cart details render immediately.
      supabase
        .from("authorization_requests")
        .select("*")
        .eq("id", r.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (requestLoadGeneration !== requestLoadGenerationRef.current) return;
          if (error) {
            toast({
              variant: "destructive",
              title: "Unable to load authorization details",
              description: getErrorMessage(error, "Could not load the complete request."),
            });
            return;
          }
          if (!data) {
            toast({
              variant: "destructive",
              title: "Request not found",
              description: "The authorization record could not be found.",
            });
            return;
          }
          setSelectedRequest((current: RequestRow | null) => current?.id === r.id ? data : current);
        });
    }
  };

  const handleCloseReview = () => {
    requestLoadGenerationRef.current += 1;
    setSelectedRequest(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("review");
      return next;
    }, { replace: true });
    // Refresh the queue after the review modal closes, not during its decision flow.
    queryClient.invalidateQueries({ queryKey: ["requests"] });
  };

  const handleRequestUpdated = () => {
    // After a decision in the modal, update only the affected request instead of
    // invalidating the entire queue. This:
    //   1. Re-fetch ONLY the single open request from the DB (1 lightweight query).
    //   2. Update it in-place in the React Query cache so the queue table reflects the change if visible.
    // The full queue server-sync happens only when the user closes the modal (handleCloseReview).
    if (selectedRequest?.id) {
      const openId = selectedRequest.id;
      supabase
        .from("authorization_requests")
        .select("*")
        .eq("id", openId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            // Update the open modal state
            setSelectedRequest(data);
            // Patch the item in-place inside the cached queue list (zero extra DB call)
            queryClient.setQueriesData(
              { queryKey: ["requests"] },
              (oldData: any) => {
                if (!oldData?.rows) return oldData;
                return {
                  ...oldData,
                  rows: oldData.rows.map((row: any) =>
                    row.id === openId ? { ...row, ...data } : row
                  ),
                };
              }
            );
          }
        });
    }
  };

  useTabVisibilityRefresh(() => {
    if (!selectedRequest) {
      fetchRequests();
    }
  });

  // Fetch the OTP for the open request whenever its review modal opens.
  // This covers the case where the user loads directly from ?review=<id> (URL deep-link or page refresh)
  // — in that scenario the bulk OTP effect never ran because requests[] was empty.
  useEffect(() => {
    if (!selectedRequest?.id) return;
    if (role !== "nurse" && role !== "admin") return;
    // Skip if already fetched
    if (fetchedOtpIdsRef.current.has(selectedRequest.id)) return;

    const id = selectedRequest.id;
    fetchedOtpIdsRef.current.add(id);

    const loadOtp = async () => {
      try {
        const { data, error } = await supabase.rpc("get_otp_value" as any, { p_request_id: id });
        if (error) {
          fetchedOtpIdsRef.current.delete(id);
          toast({
            variant: "destructive",
            title: "Could not load arrival PIN",
            description: error.message.toLowerCase().includes("mfa verification")
              ? "Complete MFA verification to view arrival PINs."
              : "The arrival PIN could not be loaded. Refresh the queue and try again.",
          });
          return;
        }
        if (data) {
          const otpRow = Array.isArray(data) ? data[0] : data;
          if (otpRow?.otp_value) {
            setOtpValues(prev => ({ ...prev, [id]: otpRow.otp_value }));
            if (otpRow.verified || otpRow.consumed_at) {
              setOtpVerifiedStatus(prev => ({ ...prev, [id]: true }));
            }
          }
        }
      } catch {
        fetchedOtpIdsRef.current.delete(id);
        toast({
          variant: "destructive",
          title: "Could not load arrival PIN",
          description: "The arrival PIN could not be loaded. Refresh the queue and try again.",
        });
      }
    };
    void loadOtp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRequest?.id, role]); // fetchedOtpIdsRef intentionally omitted (ref, stable)

  // Fetch OTP values and verification statuses for relevant requests.
  // IMPORTANT: otpValues and otpVerifiedStatus must NOT be in the dependency array —
  // they update on every fetch which would create an infinite re-fetch loop.
  // We use fetchedOtpIdsRef to ensure each ID is fetched at most once per page load.
  useEffect(() => {
    if (!Array.isArray(requests) || !requests.length || !role || role === "claims") return;

    const requestsToFetch = requests.filter(r => {
      // Skip if already fetched or currently loading
      if (fetchedOtpIdsRef.current.has(r.id)) return false;
      if (otpLoading[r.id]) return false;

      if (role === "nurse" || role === "admin") {
        return true;
      }
      return false;
    });

    if (requestsToFetch.length === 0) return;

    // Mark all as fetched immediately so rapid re-renders don't trigger duplicate calls
    requestsToFetch.forEach(r => fetchedOtpIdsRef.current.add(r.id));

    const fetchOtps = async () => {
      const updates: Record<string, boolean> = {};
      requestsToFetch.forEach(r => updates[r.id] = true);
      setOtpLoading(prev => ({ ...prev, ...updates }));

      try {
        if (role === "nurse" || role === "admin") {
          const ids = requestsToFetch.map(r => r.id);
          const { data, error } = await supabase.rpc("get_otp_values_batch" as any, {
            p_request_ids: ids,
          });

          if (error) {
            requestsToFetch.forEach(r => fetchedOtpIdsRef.current.delete(r.id));
            const requiresMfa = error.message.toLowerCase().includes("mfa verification");
            toast({
              variant: "destructive",
              title: "Could not load arrival PINs",
              description: requiresMfa
                ? "Complete MFA verification to view arrival PINs."
                : "The arrival PINs could not be loaded. Refresh the queue and try again.",
            });
            return;
          }
          if (!Array.isArray(data)) {
            requestsToFetch.forEach(r => fetchedOtpIdsRef.current.delete(r.id));
            toast({
              variant: "destructive",
              title: "Could not load arrival PINs",
              description: "The PIN service returned an invalid response. Refresh the queue and try again.",
            });
            return;
          }

          const newValues: Record<string, string> = {};
          const newVerified: Record<string, boolean> = {};
          data.forEach((row: any) => {
            if (row.otp_value && row.authorization_id) {
              newValues[row.authorization_id] = row.otp_value;
              if (row.verified) newVerified[row.authorization_id] = true;
            }
          });
          if (Object.keys(newValues).length > 0) setOtpValues(prev => ({ ...prev, ...newValues }));
          if (Object.keys(newVerified).length > 0) setOtpVerifiedStatus(prev => ({ ...prev, ...newVerified }));
        }
      } finally {
        const loadingReset: Record<string, boolean> = {};
        requestsToFetch.forEach(r => loadingReset[r.id] = false);
        setOtpLoading(prev => ({ ...prev, ...loadingReset }));
      }
    };

    fetchOtps().catch(() => {
      requestsToFetch.forEach(r => fetchedOtpIdsRef.current.delete(r.id));
      toast({
        variant: "destructive",
        title: "Could not load arrival PINs",
        description: "The arrival PINs could not be loaded. Refresh the queue and try again.",
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, role]); // otpValues & otpVerifiedStatus intentionally omitted — see comment above

  const executeDelete = async () => {
    if (!deleteTarget || deleteConfirmText.trim() !== "DELETE") return;
    if (!deleteReason.trim()) {
      toast({ variant: "destructive", title: "Reason required", description: "Enter the reason for requesting deletion." });
      return;
    }
    setDeleteProcessing(true);
    try {
      const { error } = await (supabase as any).rpc("rpc_request_deletion_approval", {
        p_request_id: deleteTarget.id,
        p_reason: deleteReason.trim(),
      });
      if (error) throw error;

      if (isDeleteApprover) {
        const { error: resolveError } = await (supabase as any).rpc("rpc_resolve_delete_request", {
          p_request_id: deleteTarget.id,
          p_action: "approved",
        });
        if (resolveError) throw resolveError;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requests"] }),
        queryClient.invalidateQueries({ queryKey: ["delete-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["delete-archive"] }),
      ]);
      toast(isDeleteApprover
        ? { title: "Authorization deleted", description: "The deletion was recorded in the audit log." }
        : { title: "Awaiting Review", description: "The deletion request was sent to a Utilization Manager Lead or Admin." });
      setDeleteTarget(null);
      setDeleteConfirmText("");
      setDeleteReason("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete request failed", description: error?.message || "Unable to submit the deletion request." });
    } finally {
      setDeleteProcessing(false);
    }
  };


  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-center md:gap-4">
          <div className="w-full min-w-0 md:w-auto">
            <Tabs value={statusFilter === 'action_required' ? 'action_required' : 'all'} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }} className="w-full min-w-0 md:w-auto">
              <TabsList aria-label="Filter authorization requests" className="grid h-10 w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 rounded-lg bg-slate-100 p-1 sm:inline-grid sm:w-auto sm:min-w-[280px]">
                <TabsTrigger value="action_required" className="h-full min-h-0 min-w-0 w-full whitespace-nowrap rounded-md px-2 py-0 text-xs font-semibold text-slate-600 transition-colors data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-200/70 active:bg-slate-200 sm:px-4">Action Needed</TabsTrigger>
                <TabsTrigger value="all" className="h-full min-h-0 min-w-0 w-full whitespace-nowrap rounded-md px-2 py-0 text-xs font-semibold text-slate-600 transition-colors data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-200/70 active:bg-slate-200 sm:px-4">All Requests</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end md:w-auto">
          {statusFilter !== 'action_required' && (
            <Select value={statusFilter} onValueChange={(val: any) => { setStatusFilter(val); setCurrentPage(1); }}>
              <SelectTrigger className="h-11 w-full rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 sm:h-9 sm:w-40">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-100 shadow-xl">
                <SelectItem value="all" className="text-xs font-semibold">All Status</SelectItem>
                <SelectItem value="pending" className="text-xs font-semibold">Pending</SelectItem>
                <SelectItem value="pending_referral" className="text-xs font-semibold">Pending Referral</SelectItem>
                <SelectItem value="referral_approved" className="text-xs font-semibold">Referral Approved</SelectItem>
                <SelectItem value="referral_accepted" className="text-xs font-semibold">Referral Accepted</SelectItem>
                <SelectItem value="pending_authorization" className="text-xs font-semibold">Pending Authorization</SelectItem>
                <SelectItem value="approved" className="text-xs font-semibold text-emerald-600">Approved</SelectItem>
                <SelectItem value="partially_approved" className="text-xs font-semibold text-amber-600">Partially Approved</SelectItem>
                <SelectItem value="rejected" className="text-xs font-semibold text-rose-600">Rejected</SelectItem>
                <SelectItem value="referral_declined" className="text-xs font-semibold text-rose-600">Referral Declined</SelectItem>
                <SelectItem value="referral_expired" className="text-xs font-semibold text-rose-600">Referral Expired</SelectItem>
                <SelectItem value="deferred" className="text-xs font-semibold text-amber-600">Deferred</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Search records..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="h-11 rounded-lg border border-slate-200 bg-white pl-8 text-sm font-medium focus-visible:ring-1 focus-visible:ring-slate-400 sm:h-9 sm:text-xs" />
          </div>
        </div>
        </div>
      </div>

      <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {isError ? (
          <Alert variant="destructive" className="m-4">
            <AlertTitle>Could not load authorization requests</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{getErrorMessage(error, "Check your connection and retry. Your filters are unchanged.")}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void fetchRequests()} disabled={isLoading}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
        <>
        <RequestList 
          requests={requests}
          role={role ?? undefined}
          isClaimsRole={isClaimsRole}
          approverNames={approverNames}
          otpValues={otpValues}
          otpLoading={otpLoading}
          otpVerifiedStatus={otpVerifiedStatus}
          onSelectRequest={handleSelectRequest}
          onDeleteRequest={setDeleteTarget}
          setOtpVerifiedStatus={setOtpVerifiedStatus}
          isLoading={isLoading}
        />
        {requests.length === 0 && !isLoading && (
          <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            No records found
          </div>
        )}
        </>
        )}
      </Card>

      <div className="flex items-center justify-between px-2">
        <p className="text-xs font-bold text-slate-500">
          Showing {visibleStart} to {visibleEnd}{hasMore ? " (more available)" : ""}
        </p>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading} className="h-7 px-3 text-xs rounded-lg">Prev</Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={!hasMore || isLoading} className="h-7 px-3 text-xs rounded-lg">Next</Button>
        </div>
      </div>

      <ReviewModal 
        request={selectedRequest} 
        open={!!selectedRequest} 
        onClose={handleCloseReview} 
        onUpdated={handleRequestUpdated} 
        otpValue={selectedRequest ? otpValues[selectedRequest.id] : undefined}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{isDeleteApprover ? "Delete Authorization?" : "Request Record Deletion?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isDeleteApprover
                ? "This will permanently delete the authorization and record the action in the audit log. This cannot be undone."
                : "This will send the request to a Utilization Manager Lead or Admin for review."} Type <span className="font-black">DELETE</span> to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className="h-10 rounded-xl" />
          <div className="space-y-1">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Reason for deletion request</Label>
            <Input value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="Explain why this should be deleted..." className="h-10 rounded-xl" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <Button
              type="button"
              disabled={deleteConfirmText !== "DELETE" || !deleteReason.trim() || deleteProcessing}
              onClick={() => void executeDelete()}
              className="rounded-xl bg-rose-600 hover:bg-rose-700"
            >
              {deleteProcessing ? (isDeleteApprover ? "Deleting…" : "Submitting…") : (isDeleteApprover ? "Delete Authorization" : "Submit Request")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
