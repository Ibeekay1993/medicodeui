import { useCallback, useEffect, useMemo, useState } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

import { useClaimsQuery, useHospitalsQuery, useVerifyClaimQuery, useUpdateClaimMutation } from "../hooks/useClaims";

import { 
  ClaimDraft, 
  AuditDecision, 
  money, 
  hospitalNameCanReceiveReferral,
  buildHospitalExplanation
} from "@/lib/claims-helpers";

import ClaimsFilterHeader from "@/components/claims/ClaimsFilterHeader";
import ClaimsTable from "@/components/claims/ClaimsTable";
import ClaimAuditDrawer from "@/components/claims/ClaimAuditDrawer";
import ClaimAuditDialogs from "@/components/claims/ClaimAuditDialogs";

export default function ClaimsPortalPage() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 400);
  const [statusTab, setStatusTab] = useState<string>("pending");
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("all");
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const { data: claimsData, isLoading: loading, refetch: refresh, isError, error } = useClaimsQuery({
    selectedHospitalId,
    statusTab,
    debouncedSearchTerm,
    page,
    pageSize,
  });

  if (isError && error) {
    toast({ variant: "destructive", title: "Error", description: getErrorMessage(error, "Unable to load claims ledger") });
  }

  const claims = claimsData?.claims || [];
  const totalClaims = claimsData?.total || 0;

  const { data: hospitals = [] } = useHospitalsQuery();
  
  const updateClaimMutation = useUpdateClaimMutation();

  // Dialog States
  const [declineDialog, setDeclineDialog] = useState<{ key: string; item?: any } | null>(null);
  const [adjustDialog, setAdjustDialog] = useState<{ key: string; item?: any } | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [approvalDialog, setApprovalDialog] = useState<{ key: string; item?: any } | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [declineCategory, setDeclineCategory] = useState("");
  const [declineNote, setDeclineNote] = useState("");

  const selectedClaim = claims.find(c => c.id === selectedClaimId) || null;
  const [auditDecisions, setAuditDecisions] = useState<Record<string, AuditDecision>>({});

  useEffect(() => {
    if (!selectedClaimId) {
      setAuditDecisions({});
      return;
    }
    try {
      const saved = sessionStorage.getItem(`claim_audit_${selectedClaimId}`);
      setAuditDecisions(saved ? JSON.parse(saved) : {});
    } catch {
      setAuditDecisions({});
    }
  }, [selectedClaimId]);

  useEffect(() => {
    if (!selectedClaimId) return;
    sessionStorage.setItem(`claim_audit_${selectedClaimId}`, JSON.stringify(auditDecisions));
  }, [selectedClaimId, auditDecisions]);

  const declinedItemCodes = useMemo(
    () => Object.entries(auditDecisions).filter(([, decision]) => decision.status === "declined").map(([key]) => key),
    [auditDecisions]
  );

  const itemKey = (item: any, index?: number) => String(item.code || item.name || index || "item");
  const itemUnit = (item: any) => Number(item.unit_price ?? item.price ?? 0);
  const itemQty = (item: any) => Math.max(1, Number(item.quantity ?? 1));

  const handleStatusUpdate = async (
    claimId: string,
    newStatus: "approved" | "partially_approved" | "rejected",
    approvedAmount?: number,
    auditNote?: string
  ) => {
    if (role === "hospital") {
      toast({ variant: "destructive", title: "Unauthorized", description: "Hospitals cannot audit claims." });
      return;
    }
    const originalAmount = Number(selectedClaim?.total_amount || 0);
    const resolvedAuditItems = verificationData.approvedItems.map((item: any, idx: number) => {
      const key = itemKey(item, idx);
      const isPreDeclined = !!item.declined;
      const decision = auditDecisions[key] || { 
        status: isPreDeclined ? "declined" : "approved",
        reason: isPreDeclined ? (item.decline_reason || "Declined during pre-authorization") : undefined,
        reasonCategory: isPreDeclined ? "PRE_AUTH_DECLINED" : undefined
      };
      const originalQuantity = itemQty(item);
      const approvedQuantity = (decision.status === "declined" || isPreDeclined) ? 0 : Number(decision.approvedQuantity ?? originalQuantity);
      const unitPrice = Number(decision.approvedUnitPrice ?? itemUnit(item));
      return {
        ...item,
        audit_status: (decision.status === "declined" || isPreDeclined) ? "declined" : decision.status,
        original_quantity: originalQuantity,
        approved_quantity: approvedQuantity,
        quantity: approvedQuantity,
        unit_price: unitPrice,
        original_total: originalQuantity * itemUnit(item),
        approved_total: approvedQuantity * unitPrice,
        total: approvedQuantity * unitPrice,
        decline_reason: (decision.status === "declined" || isPreDeclined) ? (decision.reason || item.decline_reason) : null,
        decline_reason_category: decision.reasonCategory || (isPreDeclined ? "PRE_AUTH_DECLINED" : null),
        audit_reason: decision.reason || (isPreDeclined ? item.decline_reason : null),
        audit_note: decision.note || null,
        hospital_explanation: decision.aiExplanation || null,
        item_audit_status: (decision.status === "declined" || isPreDeclined) ? "Declined" : "Approved"
      };
    });

    const resolvedSummary = {
      original: originalAmount,
      approved: approvedAmount ?? 0,
      declined: Math.max(0, originalAmount - Number(approvedAmount || 0)),
      savings: Math.max(0, originalAmount - Number(approvedAmount || 0)),
      approvedCount: resolvedAuditItems.filter((item: any) => item.audit_status === "approved" && Number(item.approved_quantity || 0) > 0).length,
      declinedCount: resolvedAuditItems.filter((item: any) => item.audit_status === "declined" || Number(item.approved_quantity || 0) === 0).length,
      finalStatus: newStatus
    };

    const approvedItemCount = Number(resolvedSummary.approvedCount || 0);
    const declinedItemCount = Number(resolvedSummary.declinedCount || 0);
    const effectiveStatus = newStatus === "rejected"
      ? "rejected"
      : approvedItemCount === 0
        ? "rejected"
        : declinedItemCount > 0 || Number(resolvedSummary.declined || 0) > 0
          ? "partially_approved"
          : "approved";

    const itemDecisionLines = resolvedAuditItems.map((item: any) => {
      const name = item.name || item.code || "Claim item";
      if (item.audit_status === "declined" || Number(item.approved_quantity || 0) === 0) {
        return `- DECLINED: ${name} | Category: ${item.decline_reason_category || "Audit decline"} | Reason: ${item.audit_reason || item.decline_reason || "Declined by audit"} | Hospital explanation: ${item.hospital_explanation || "Declined after audit review."}`;
      }
      if (Number(item.approved_quantity || 0) < Number(item.original_quantity || item.quantity || 0)) {
        return `- ADJUSTED: ${name} | Approved ${item.approved_quantity} of ${item.original_quantity} | Reason: ${item.audit_reason || "Quantity adjusted by audit"}`;
      }
      return `- APPROVED: ${name}${item.audit_note ? ` | Note: ${item.audit_note}` : ""}`;
    });

    const generatedAuditNote = `[CLAIMS AUDIT COMPLETED]
Claim Reference: ${selectedClaim?.claim_number || claimId}
Status: ${String(effectiveStatus).replace("_", " ").toUpperCase()}
Original Claim Value: ${money(originalAmount)}
Audited Approved Value: ${money(Number(approvedAmount || 0))}
Declined Value: ${money(Math.max(0, originalAmount - Number(approvedAmount || 0)))}

ITEM AUDIT DECISIONS:
${itemDecisionLines.join("\n")}`;

    const resolvedAuditNote = auditNote
      ? `${auditNote}\n\n${generatedAuditNote}`
      : generatedAuditNote;

    const updateData: any = {
      status: effectiveStatus,
      original_amount: originalAmount,
      approved_amount: approvedAmount ?? 0,
      declined_amount: Math.max(0, originalAmount - Number(approvedAmount || 0)),
      total_amount: approvedAmount ?? 0,
      audit_note: resolvedAuditNote,
      notes: resolvedAuditNote || selectedClaim?.notes || null,
      audit_items: resolvedAuditItems,
      audit_summary: resolvedSummary,
      line_items: resolvedAuditItems
    };

    // If this was a contest review and it was not fully rejected, move it straight to awaiting_payment
    if (["contested", "under_contest"].includes(String(selectedClaim?.status).toLowerCase()) && effectiveStatus !== "rejected") {
      updateData.payment_status = "awaiting_payment";
    }

    try {
      await updateClaimMutation.mutateAsync({ claimId, updateData });
      toast({ 
        title: `Claim ${newStatus.toUpperCase()}`, 
        description: newStatus !== "rejected" && approvedAmount !== undefined
          ? `Claim approved with adjusted audited total of ${money(approvedAmount)}.`
          : "Status has been synchronized across the ledger." 
      });
      sessionStorage.removeItem(`claim_audit_${claimId}`);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    }
  };

  useEffect(() => {
    setPage(1);
  }, [selectedHospitalId, statusTab, debouncedSearchTerm]);

  useTabVisibilityRefresh(refresh, Boolean(user));

  const openApprovalDialog = (key: string, item?: any) => {
    setApprovalDialog({ key, item });
    setApprovalNote(auditDecisions[key]?.note || "");
  };

  const confirmItemApproval = () => {
    if (!approvalDialog) return;
    setAuditDecisions(prev => ({
      ...prev,
      [approvalDialog.key]: { ...(prev[approvalDialog.key] || { status: "approved" }), status: "approved", note: approvalNote.trim() || undefined }
    }));
    setApprovalDialog(null);
    setApprovalNote("");
  };

  const openDeclineDialog = (key: string, item: any) => {
    const existing = auditDecisions[key];
    setDeclineDialog({ key, item });
    setDeclineCategory(existing?.reasonCategory || "");
    setDeclineNote(existing?.note || existing?.reason || "");
  };

  const confirmItemDecline = () => {
    if (!declineDialog) return;
    const category = declineCategory.trim();
    const note = declineNote.trim();
    if (!category || !note) {
      toast({ variant: "destructive", title: "Decline reason required", description: "Select a reason category and enter the auditor note before declining this item." });
      return;
    }
    const itemName = declineDialog.item?.name || declineDialog.item?.item_name || "this item";
    const aiExplanation = buildHospitalExplanation(category, note, itemName);
    setAuditDecisions(prev => ({
      ...prev,
      [declineDialog.key]: {
        ...(prev[declineDialog.key] || { status: "declined" }),
        status: "declined",
        reasonCategory: category,
        reason: note,
        note,
        aiExplanation
      }
    }));
    setDeclineDialog(null);
    setDeclineCategory("");
    setDeclineNote("");
  };

  const adjustItemQuantity = (key: string, item: any) => {
    const currentQty = auditDecisions[key]?.approvedQuantity ?? itemQty(item);
    setAdjustDialog({ key, item });
    setAdjustQuantity(String(currentQty));
    setAdjustReason(auditDecisions[key]?.reason || "");
  };

  const confirmQuantityAdjustment = () => {
    if (!adjustDialog) return;
    const approvedQuantity = Number(adjustQuantity);
    const item = adjustDialog.item;
    if (!Number.isFinite(approvedQuantity) || approvedQuantity < 0 || approvedQuantity > itemQty(item)) {
      toast({ variant: "destructive", title: "Invalid quantity", description: `Enter a quantity from 0 to ${itemQty(item)}.` });
      return;
    }
    const reason = adjustReason;
    if (!reason?.trim()) {
      toast({ variant: "destructive", title: "Audit reason required", description: "A reason is required for quantity adjustments." });
      return;
    }
    setAuditDecisions(prev => ({
      ...prev,
      [adjustDialog.key]: {
        ...(prev[adjustDialog.key] || { status: "approved" }),
        status: approvedQuantity === 0 ? "declined" : "approved",
        approvedQuantity,
        reason: reason.trim()
      }
    }));
    setAdjustDialog(null);
    setAdjustQuantity("");
    setAdjustReason("");
  };

  const [verificationData, setVerificationData] = useState<{
    exists: boolean;
    authRequest: any | null;
    approvedItems: any[];
    loading: boolean;
    mismatchReasons: string[];
  }>({ exists: false, authRequest: null, approvedItems: [], loading: false, mismatchReasons: [] });

  const calculatedApprovedAmount = useMemo(() => {
    if (!verificationData.approvedItems || verificationData.approvedItems.length === 0) {
      return Number(selectedClaim?.total_amount || 0);
    }
    return verificationData.approvedItems.reduce((sum, item, index) => {
      const key = itemKey(item, index);
      const isPreDeclined = !!item.declined;
      const decision = auditDecisions[key] || { status: isPreDeclined ? "declined" : "approved" };
      if (decision.status === "declined" || isPreDeclined) return sum;
      const unitPrice = Number(decision.approvedUnitPrice ?? itemUnit(item));
      const qty = Number(decision.approvedQuantity ?? itemQty(item));
      return sum + (unitPrice * qty);
    }, 0);
  }, [verificationData.approvedItems, auditDecisions, selectedClaim]);

  const auditSummary = useMemo(() => {
    const original = Number(selectedClaim?.total_amount || 0);
    const declined = Math.max(0, original - calculatedApprovedAmount);
    const approvedCount = verificationData.approvedItems.filter((item, index) => {
      const isPreDeclined = !!item.declined;
      const status = auditDecisions[itemKey(item, index)]?.status || (isPreDeclined ? "declined" : "approved");
      return status === "approved";
    }).length;
    const declinedCount = verificationData.approvedItems.filter((item, index) => {
      const isPreDeclined = !!item.declined;
      const status = auditDecisions[itemKey(item, index)]?.status || (isPreDeclined ? "declined" : "approved");
      return status === "declined";
    }).length;
    return {
      original,
      approved: calculatedApprovedAmount,
      declined,
      savings: declined,
      approvedCount,
      declinedCount,
      finalStatus: approvedCount === 0 ? "rejected" : declinedCount > 0 || declined > 0 ? "partially_approved" : "approved"
    };
  }, [selectedClaim, calculatedApprovedAmount, verificationData.approvedItems, auditDecisions]);

  const { data: authRequestData, isLoading: authRequestLoading, isError: authRequestError } = useVerifyClaimQuery(selectedClaim);

  useEffect(() => {
    if (!selectedClaim) {
      setVerificationData({ exists: false, authRequest: null, approvedItems: [], loading: false, mismatchReasons: [] });
      return;
    }

    if (authRequestLoading) {
      setVerificationData(prev => ({ ...prev, loading: true, mismatchReasons: [] }));
      return;
    }

    if (authRequestError || !authRequestData) {
      setVerificationData({
        exists: false,
        authRequest: null,
        approvedItems: [],
        loading: false,
        mismatchReasons: ["No matching pre-authorization record found in the system. (POSSIBLE FORGERY DETECTED)"]
      });
      return;
    }

    const authData = authRequestData as any;
    const reasons: string[] = [];
    
    // Mismatch check 1: Patient Name
    const name1 = (selectedClaim.patient_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const name2 = (authData.patient_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (name1 !== name2 && !name1.includes(name2) && !name2.includes(name1)) {
      reasons.push(`Patient Name mismatch: Claim shows '${selectedClaim.patient_name}' vs clinical record '${authData.patient_name}'.`);
    }
    
    // Mismatch check 2: Policy Number
    const policy1 = (selectedClaim.policy_number || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const policy2 = (authData.policy_number || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (policy1 !== policy2) {
      reasons.push(`Enrollment ID mismatch: Claim shows '${selectedClaim.policy_number}' vs clinical record '${authData.policy_number}'.`);
    }
    
    // Mismatch check 3: Claim owner must match referral/claiming hospital
    const authClaimOwnerName = authData.referred_hospital_name || authData.claiming_hospital_name || authData.hospital_name || authData.requesting_hospital || "";
    const submittedHospitalName = selectedClaim.hospital_name || "";
    if (authClaimOwnerName && !hospitalNameCanReceiveReferral(authClaimOwnerName, submittedHospitalName)) {
      reasons.push(`Claim ownership mismatch: ${submittedHospitalName || "submitted hospital"} is not the authorized claim owner '${authClaimOwnerName}'.`);
    }
    
    // Mismatch check 4: Claim Amount vs Approved Limit
    const claimedVal = Number(selectedClaim.total_amount || 0);
    const approvedVal = Number(authData.total_amount || 0);
    if (claimedVal > approvedVal && approvedVal > 0) {
      reasons.push(`Over-claim detected: Claimed amount (${money(claimedVal)}) exceeds approved clinical limit (${money(approvedVal)}).`);
    }
    
    // Mismatch check 5: Clinical Auth status must be approved
    if (authData.status !== "approved") {
      reasons.push(`Associated clinical authorization is in '${(authData.status || "").toUpperCase()}' state, not APPROVED.`);
    }

    const approvedItems = Array.isArray(authData.approved_items) ? authData.approved_items : [];
    setVerificationData({
      exists: true,
      authRequest: authData,
      approvedItems,
      loading: false,
      mismatchReasons: reasons
    });
  }, [selectedClaim, authRequestData, authRequestLoading, authRequestError]);

  const totalPages = Math.max(1, Math.ceil(totalClaims / pageSize));
  const start = totalClaims === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalClaims);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  if (loading) {
    return (
      <div className="flex h-64 flex-col gap-3 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-800" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Claims Ledger...</p>
      </div>
    );
  }



  return (
    <div className="space-y-3 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      <ClaimsFilterHeader
        statusTab={statusTab}
        setStatusTab={setStatusTab}
        selectedHospitalId={selectedHospitalId}
        setSelectedHospitalId={setSelectedHospitalId}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        uniqueHospitals={hospitals}
      />


      <ClaimsTable
        paginatedClaims={claims}
        selectedClaimId={selectedClaimId}
        setSelectedClaimId={setSelectedClaimId}
        setIsMobileDetailOpen={setIsMobileDetailOpen}
        filteredClaimsLength={claims.length}
        page={page}
        totalPages={totalPages}
        start={start}
        end={end}
        total={totalClaims}
        pageSize={pageSize}
        setPage={setPage}
      />

      {selectedClaim && (
        <ClaimAuditDrawer
          selectedClaim={selectedClaim}
          isMobileDetailOpen={isMobileDetailOpen}
          setIsMobileDetailOpen={setIsMobileDetailOpen}
          verificationData={verificationData}
          auditDecisions={auditDecisions}
          declinedItemCodes={declinedItemCodes}
          auditSummary={auditSummary}
          role={role}
          openApprovalDialog={openApprovalDialog}
          openDeclineDialog={openDeclineDialog}
          adjustItemQuantity={adjustItemQuantity}
          handleStatusUpdate={handleStatusUpdate}
          copyToClipboard={copyToClipboard}
          calculatedApprovedAmount={calculatedApprovedAmount}
        />
      )}

      <ClaimAuditDialogs
        approvalDialog={approvalDialog}
        setApprovalDialog={setApprovalDialog}
        approvalNote={approvalNote}
        setApprovalNote={setApprovalNote}
        confirmItemApproval={confirmItemApproval}
        adjustDialog={adjustDialog}
        setAdjustDialog={setAdjustDialog}
        adjustQuantity={adjustQuantity}
        setAdjustQuantity={setAdjustQuantity}
        adjustReason={adjustReason}
        setAdjustReason={setAdjustReason}
        confirmQuantityAdjustment={confirmQuantityAdjustment}
        declineDialog={declineDialog}
        setDeclineDialog={setDeclineDialog}
        declineCategory={declineCategory}
        setDeclineCategory={setDeclineCategory}
        declineNote={declineNote}
        setDeclineNote={setDeclineNote}
        confirmItemDecline={confirmItemDecline}
      />
    </div>
  );
}
