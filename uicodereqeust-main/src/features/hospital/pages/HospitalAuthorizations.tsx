import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { useHospitalProfile } from "../hooks/useHospitalDashboard";
import { useHospitalAuthorizations } from "../hooks/useHospitalAuthorizations";
import { useDebounce } from "@/hooks/use-debounce";

import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
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
import ExportCSVDialog from "@/components/authorizations/ExportCSVDialog";
import { PageLoader } from "@/components/PageLoader";

export default function HospitalAuthorizations() {
  const { user, hospitalId, fullName } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [statusFilter, setStatusFilter] = useState("all");
  
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isProcessingReferral, setIsProcessingReferral] = useState(false);
  const [isAddingReferralTreatment, setIsAddingReferralTreatment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [otpVerifiedStatus, setOtpVerifiedStatus] = useState<Record<string, boolean>>({});
  const [requestChatOpen, setRequestChatOpen] = useState(false);
  const [requestChatRequest, setRequestChatRequest] = useState<any | null>(null);
  const [requestChatDraft, setRequestChatDraft] = useState("");
  const [requestChatSending, setRequestChatSending] = useState(false);

  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const { data: hospital, isLoading: hospitalLoading } = useHospitalProfile(hospitalId, user?.id, user?.email);

  const { data: authData, isLoading: authLoading, refetch } = useHospitalAuthorizations({
    hospital: hospital || null,
    statusFilter,
    debouncedSearch,
    page,
    pageSize,
  });

  const requests = authData?.requests || [];
  const total = authData?.total || 0;
  const claimStatusByRequestId = authData?.claimStatusMap || new Map<string, string>();
  const loading = hospitalLoading || authLoading;

  const totalPages = Math.ceil(total / pageSize);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  useTabVisibilityRefresh(refetch, Boolean(hospital));

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

      const { error: updateError } = await supabase.rpc("rpc_submit_hospital_claim" as any, {
        p_claim_id: (claimData as any).id,
      });

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
      toast({ title: "Request support chat created", description: "A utilization manager support ticket has been created for this authorization request." });
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

  const exportCSV = async (startDate?: string, endDate?: string) => {
    if (!hospital) return;
    setIsExporting(true);
    try {
      const idQuery = [
        `hospital_id.eq.${hospital.id}`,
        `requesting_hospital_id.eq.${hospital.id}`,
        `referring_hospital_id.eq.${hospital.id}`,
        `referred_hospital_id.eq.${hospital.id}`,
        `claiming_hospital_id.eq.${hospital.id}`
      ];

      let query = supabase
        .from("authorization_requests" as any)
        .select("created_at, patient_name, diagnosis, treatment, policy_number, authorization_code, status, clinical_notes, deletion_status")
        .or(idQuery.join(","));

      if (startDate) {
        query = query.gte("created_at", `${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query = query.lte("created_at", `${endDate}T23:59:59.999Z`);
      }

      const { data: allExportData, error } = await (query.order("created_at", { ascending: false }) as any);

      if (error) throw error;

      const exportableRequests = (allExportData || []).filter((r: any) => r.deletion_status !== "awaiting_admin_approval");
      if (!exportableRequests.length) {
        toast({ title: "No authorizations found for the selected range" });
        return;
      }

      const headers = ["Date", "Patient Name", "Diagnosis", "Treatment", "Policy Number", "Auth Code", "Status", "Clinical Notes"];
      const rows = exportableRequests.map((r: any) => [
        new Date(r.created_at).toLocaleDateString("en-GB"),
        r.patient_name || "",
        r.diagnosis || "",
        r.treatment || "",
        r.policy_number || "",
        r.authorization_code || "",
        r.status || "",
        r.clinical_notes || ""
      ]);

      const csvContent = [headers.join(","), ...rows.map((e: any) => e.map((f: any) => `"${String(f).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      
      const dateSuffix = startDate && endDate 
        ? `${startDate}_to_${endDate}` 
        : new Date().getTime().toString();
      link.download = `Hospital_Authorizations_${dateSuffix}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Export Successful" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export Failed", description: err.message || "Failed to export data." });
    } finally {
      setIsExporting(false);
    }
  };

  const paginatedRequests = requests;

  const claimStatusFor = (request: any) => claimStatusByRequestId.get(request?.id);

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      <AuthorizationsHeader
        hospitalName={hospital?.name || undefined}
        hospitalCode={hospital?.code || undefined}
        fullName={fullName || undefined}
        search={search}
        setSearch={setSearch}
        exportCSV={() => setIsExportDialogOpen(true)}
        isExporting={isExporting}
        loading={loading}
      />

      <div className="flex px-4 sm:px-0 pb-2 md:w-[250px]">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full h-9 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100/50 transition-colors focus:ring-1 focus:ring-emerald-500 shadow-none">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-slate-200">
            {[
              { id: "all", label: "All Status" },
              { id: "pending", label: "Pending" },
              { id: "approved", label: "Approved" },
              { id: "rejected", label: "Rejected" },
              { id: "pending_referral", label: "Pending Referral" },
              { id: "referral_approved", label: "Referral Approved" },
              { id: "referral_accepted", label: "Referral Accepted" },
              { id: "pending_authorization", label: "Pending Authorization" },
              { id: "referral_declined", label: "Referral Declined" },
              { id: "referral_expired", label: "Referral Expired" }
            ].map(filter => (
              <SelectItem key={filter.id} value={filter.id} className="font-semibold text-slate-700 focus:bg-emerald-50 focus:text-[#10B981] cursor-pointer">
                {filter.label}
              </SelectItem>
            ))}
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
        otpVerifiedStatus={otpVerifiedStatus}
        setOtpVerifiedStatus={setOtpVerifiedStatus}
        isLoading={loading}
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
        onUpdated={refetch}
      />

      <ReferralTreatmentFormDialog
        open={isAddingReferralTreatment}
        onClose={() => setIsAddingReferralTreatment(false)}
        request={selectedRequest}
        hospital={hospital}
        onUpdated={refetch}
      />

      <ExportCSVDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        onExport={exportCSV}
        isExporting={isExporting}
      />
    </div>
  );
}

