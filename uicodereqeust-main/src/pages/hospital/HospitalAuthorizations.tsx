import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

import { useToast } from "@/hooks/use-toast";
import { useDataPagination } from "@/hooks/use-data-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  getApprovedItems,
  claimOwnerNameFor,
  canSubmitClaimFor,
  isClaimLockedAfterTransfer,
  isFrozenAuthorization,
} from "@/lib/authorizations-helpers";

import AuthorizationsHeader from "@/components/authorizations/AuthorizationsHeader";
import AuthorizationsTable from "@/components/authorizations/AuthorizationsTable";
import SupportChatDialog from "@/components/authorizations/SupportChatDialog";
import ClaimReviewDialog from "@/components/authorizations/ClaimReviewDialog";
import ReferralProcessDialog from "@/components/authorizations/ReferralProcessDialog";
import ReferralTreatmentFormDialog from "@/components/authorizations/ReferralTreatmentFormDialog";
import { PageLoader } from "@/components/PageLoader";

export default function HospitalAuthorizations() {
  const { user, hospitalId, fullName } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hospital, setHospital] = useState<any>(null);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isProcessingReferral, setIsProcessingReferral] = useState(false);
  const [isAddingReferralTreatment, setIsAddingReferralTreatment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [claimStatusByRequestId, setClaimStatusByRequestId] = useState<Map<string, string>>(new Map());
  const [requestChatOpen, setRequestChatOpen] = useState(false);
  const [requestChatRequest, setRequestChatRequest] = useState<any | null>(null);
  const [requestChatDraft, setRequestChatDraft] = useState("");
  const [requestChatSending, setRequestChatSending] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: hosp, error: hospitalError } = hospitalId
        ? await supabase
            .from("hospitals")
            .select("id, name, code")
            .eq("id", hospitalId)
            .maybeSingle()
        : await supabase
            .from("hospitals")
            .select("id, name, code")
            .eq("user_id", user.id)
            .maybeSingle();

      if (hospitalError) throw hospitalError;
      if (!hosp) {
        setHospital(null);
        setRequests([]);
        setClaimStatusByRequestId(new Map());
        toast({
          variant: "destructive",
          title: "Hospital profile missing",
          description: "No hospital profile is linked to this login yet."
        });
        return;
      }

      setHospital(hosp);
      
      // Use only exact ID-based matching - these are indexed and fast
      // Name-based ILIKE filtering is REMOVED because it causes timeouts on large tables
      // (For records affected by the old referral bug, see the SQL migration to fix them)
      const idQuery = [
        `hospital_id.eq.${hosp.id}`,
        `requesting_hospital_id.eq.${hosp.id}`,
        `referring_hospital_id.eq.${hosp.id}`,
        `referred_hospital_id.eq.${hosp.id}`,
        `claiming_hospital_id.eq.${hosp.id}`
      ];

      const { data: idData, error: idError } = await supabase
        .from("authorization_requests")
        .select("*")
        .or(idQuery.join(","))
        .order("created_at", { ascending: false })
        .limit(1000);

      if (idError) throw idError;
      
      setRequests(idData || []);

      const { data: claimsData } = await supabase
        .from("hospital_claims" as any)
        .select("request_id,status")
        .eq("hospital_id", hosp.id);

      if (claimsData) {
        const claimMap = new Map<string, string>();
        claimsData.forEach((c: any) => {
          if (c.request_id) claimMap.set(c.request_id, String(c.status || "submitted"));
        });
        setClaimStatusByRequestId(claimMap);
      }
    } catch (error: any) {
      console.error("Authorization ledger sync error:", error);
      setRequests([]);
      toast({
        variant: "destructive",
        title: "Unable to load authorizations",
        description: error.message || "Please refresh or contact support if this continues."
      });
    } finally {
      setLoading(false);
    }
  }, [user, hospitalId, toast]);

  useEffect(() => { refresh(); }, [user, refresh]);

  useTabVisibilityRefresh(refresh);

  const handleCopyAuth = (r: any) => {
    if (!r.authorization_code) {
      toast({ variant: "destructive", title: "Missing Code", description: "This request does not have an authorization code." });
      return;
    }
    navigator.clipboard.writeText(r.authorization_code);
    toast({ title: "Copied!", description: "Authorization code copied to clipboard." });
  };

  const handleClaimSubmit = async () => {
    if (!selectedRequest || !hospital || !user) return;
    if (isFrozenAuthorization(selectedRequest)) {
      toast({
        variant: "destructive",
        title: "Claim not allowed",
        description: selectedRequest.deletion_status === "awaiting_admin_approval"
          ? "This authorization request is awaiting deletion approval and cannot be claimed."
          : `This authorization is ${String(selectedRequest.status || "not eligible").replace(/_/g, " ")} and cannot be claimed.`,
      });
      return;
    }
    if (String(selectedRequest.status || "").toLowerCase() !== "approved" || !selectedRequest.authorization_code) {
      toast({
        variant: "destructive",
        title: "Claim not allowed",
        description: "Only approved authorizations with a valid authorization code can be claimed.",
      });
      return;
    }
    if (!canSubmitClaimFor(selectedRequest, hospital)) {
      toast({
        variant: "destructive",
        title: "Claim not allowed",
        description: `This authorization is assigned to ${claimOwnerNameFor(selectedRequest) || "the treating hospital"} for treatment, claims, and payment.`,
      });
      return;
    }
    if (claimStatusByRequestId.has(selectedRequest.id)) {
      toast({
        variant: "destructive",
        title: "Duplicate Claim Detected",
        description: `A claim has already been submitted for this authorization within the last 24 hours.`
      });
      return;
    }
    
    if (isClaimLockedAfterTransfer(selectedRequest, hospital)) {
      toast({
        variant: "destructive",
        title: "Claim Blocked",
        description: "Claims must be submitted by the receiving hospital after referral transfer.",
      });
      return;
    }
    setIsSubmitting(true);

    try {
      const approvedItems = getApprovedItems(selectedRequest);
      const { data: claimData, error: createError } = await supabase.from("hospital_claims" as any).insert({
        hospital_id: hospital.id,
        hospital_name: hospital.name,
        request_id: selectedRequest.id,
        claim_number: `CLM-${selectedRequest.authorization_code || Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        auth_code: selectedRequest.authorization_code,
        patient_name: selectedRequest.patient_name,
        policy_number: selectedRequest.policy_number,
        diagnosis: selectedRequest.diagnosis || "Not Specified",
        approved_for: selectedRequest.treatment || "N/A",
        status: "draft",
        total_amount: selectedRequest.total_amount || 0,
        original_amount: selectedRequest.total_amount || 0,
        approved_amount: selectedRequest.total_amount || 0,
        notes: `Automated claim submission for auth ${selectedRequest.authorization_code}`,
        approved_items: approvedItems,
        line_items: approvedItems,
        requesting_hospital_id: selectedRequest.requesting_hospital_id || selectedRequest.hospital_id || null,
        requesting_hospital_name: selectedRequest.requesting_hospital_name || selectedRequest.hospital_name || null,
        referring_hospital_id: selectedRequest.referring_hospital_id || selectedRequest.hospital_id || null,
        referring_hospital_name: selectedRequest.referring_hospital_name || selectedRequest.hospital_name || null,
        referred_hospital_id: selectedRequest.referred_hospital_id || null,
        referred_hospital_name: selectedRequest.referred_hospital_name || null,
        claiming_hospital_id: hospital.id,
        claiming_hospital_name: hospital.name,
        created_by: user.id
      }).select().single();

      if (createError) throw createError;

      const { error: updateError } = await supabase
        .from("hospital_claims" as any)
        .update({ status: "submitted" })
        .eq("id", (claimData as any).id);

      if (updateError) throw updateError;

      toast({ title: "Claim Submitted", description: "Your reimbursement request has been logged successfully." });
      setIsReviewing(false);
      setClaimStatusByRequestId(prev => {
        const next = new Map(prev);
        next.set(selectedRequest.id, "submitted");
        return next;
      });
    } catch (error: any) {
      console.error("Claim submission error:", error);
      toast({ 
        variant: "destructive", 
        title: "Submission Failed", 
        description: error.message || "An error occurred while logging this claim." 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRequestChat = async (request: any) => {
    try {
      const result = await (supabase as any)
        .from("support_conversations")
        .select("id, subject, status")
        .eq("linked_request_id", request.id)
        .eq("ticket_type", "request_support")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (result?.data) {
        navigate(`/dashboard/messages?conversation=${result.data.id}`);
        return;
      }
    } catch (e) {
      console.error("Error checking existing conversation:", e);
    }

    setRequestChatRequest(request);
    setRequestChatDraft("");
    setRequestChatOpen(true);
  };

  const handleCreateRequestSupportChat = async () => {
    if (!requestChatRequest || !requestChatDraft.trim()) return;
    setRequestChatSending(true);
    try {
      const { error } = await supabase.rpc("create_request_support_ticket" as any, {
        _request_id: requestChatRequest.id,
        _initial_message: requestChatDraft.trim(),
        _priority: "normal",
      });
      if (error) throw error;
      setRequestChatOpen(false);
      setRequestChatDraft("");
      toast({ title: "Request support chat created", description: "A nurse support ticket has been created for this authorization request." });
      navigate("/dashboard/messages");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Chat creation failed",
        description: error.message || "Unable to create the request support chat.",
      });
    } finally {
      setRequestChatSending(false);
    }
  };

  const exportCSV = () => {
    const exportableRequests = requests.filter(r => r.deletion_status !== "awaiting_admin_approval");
    if (!exportableRequests.length) return toast({ title: "No authorizations to export" });
    setIsExporting(true);
    try {
      const headers = ["Date", "Patient Name", "Diagnosis", "Treatment", "Policy Number", "Auth Code", "Status", "Clinical Notes"];
      const rows = exportableRequests.map(r => [
        new Date(r.created_at).toLocaleDateString("en-GB"),
        r.patient_name || "",
        r.diagnosis || "",
        r.treatment || "",
        r.policy_number || "",
        r.authorization_code || "",
        r.status || "",
        r.clinical_notes || ""
      ]);

      const csvContent = [headers.join(","), ...rows.map(e => e.map(f => `"${String(f).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Hospital_Authorizations_${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Export Successful" });
    } finally {
      setIsExporting(false);
    }
  };

  const filtered = requests.filter(r => {
    const matchesSearch = 
      (r.patient_name || "").toLowerCase().includes(search.toLowerCase()) || 
      (r.policy_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.authorization_code && r.authorization_code.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const {
    page,
    setPage,
    pageSize,
    totalPages,
    pageItems: paginatedRequests,
    start,
    end,
    total
  } = useDataPagination(filtered);

  const claimStatusFor = (request: any) => claimStatusByRequestId.get(request?.id);

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-4 max-w-7xl overflow-x-hidden pb-10 animate-in fade-in duration-500">
      <AuthorizationsHeader
        hospitalName={hospital?.name || undefined}
        hospitalCode={hospital?.code || undefined}
        fullName={fullName || undefined}
        search={search}
        setSearch={setSearch}
        exportCSV={exportCSV}
        isExporting={isExporting}
        loading={loading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
          <SelectTrigger className="h-8 w-36 rounded-lg bg-slate-100 border-none text-xs font-bold">
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
          </SelectContent>
        </Select>
      </div>

      <AuthorizationsTable
        paginatedRequests={paginatedRequests}
        hospital={hospital}
        claimStatusFor={claimStatusFor}
        handleCopyAuth={handleCopyAuth}
        openRequestChat={openRequestChat}
        setSelectedRequest={setSelectedRequest}
        setIsReviewing={setIsReviewing}
        onProcessReferral={(r) => {
          setSelectedRequest(r);
          setIsProcessingReferral(true);
        }}
        onSubmitTreatmentPlan={(r) => {
          setSelectedRequest(r);
          setIsAddingReferralTreatment(true);
        }}
        page={page}
        totalPages={totalPages}
        start={start}
        end={end}
        total={total}
        pageSize={pageSize}
        setPage={setPage}
      />

      <SupportChatDialog
        requestChatOpen={requestChatOpen}
        setRequestChatOpen={setRequestChatOpen}
        requestChatRequest={requestChatRequest}
        requestChatDraft={requestChatDraft}
        setRequestChatDraft={setRequestChatDraft}
        requestChatSending={requestChatSending}
        handleCreateRequestSupportChat={handleCreateRequestSupportChat}
      />

      <ClaimReviewDialog
        isReviewing={isReviewing}
        setIsReviewing={setIsReviewing}
        selectedRequest={selectedRequest}
        hospital={hospital}
        claimStatusFor={claimStatusFor}
        isSubmitting={isSubmitting}
        handleClaimSubmit={handleClaimSubmit}
      />

      <ReferralProcessDialog
        open={isProcessingReferral}
        onClose={() => setIsProcessingReferral(false)}
        request={selectedRequest}
        hospital={hospital}
        onUpdated={refresh}
      />

      <ReferralTreatmentFormDialog
        open={isAddingReferralTreatment}
        onClose={() => setIsAddingReferralTreatment(false)}
        request={selectedRequest}
        hospital={hospital}
        onUpdated={refresh}
      />
    </div>
  );
}
