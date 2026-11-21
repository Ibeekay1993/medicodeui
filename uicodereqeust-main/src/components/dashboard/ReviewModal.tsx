import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { areHospitalNamesMatching } from "@/lib/authorizations-helpers";
import {
  getAuthorizationDecisionLabel,
  getAuthorizationSlaMinutes,
} from "@/lib/authorizationTime";

// Custom Hooks
import { useAuth } from "@/contexts/AuthContext";
import { useClinicalVerification } from "@/hooks/clinical/useClinicalVerification";
import { useClinicalActions } from "@/hooks/clinical/useClinicalActions";
import { usePrimaryHospitalLookup } from "@/hooks/clinical/usePrimaryHospitalLookup";
import { useWhatsAppClinicalRecovery } from "@/hooks/clinical/useWhatsAppClinicalRecovery";
import { usePatientArrivalPinResend } from "@/hooks/clinical/usePatientArrivalPinResend";
import { useRequestingHospitalCode } from "@/hooks/clinical/useRequestingHospitalCode";
import { useVisibleHistory, formatClinicalNotes } from "@/hooks/clinical/useVisibleHistory";
import { useTreatmentCart } from "@/hooks/clinical/useTreatmentCart";

// Modular Sub-components
import { PatientVerifyCard } from "./review/PatientVerifyCard";
import { ClinicalHistory } from "./review/ClinicalHistory";
import { PostReviewTemplates } from "./review/PostReviewTemplates";
import { ArrivalPinBanner } from "./review/ArrivalPinBanner";
import { ReviewModalHeader } from "./review/ReviewModalHeader";
import { ClinicalLockBanners } from "./review/ClinicalLockBanners";
import { DiagnosisReferralCard } from "./review/DiagnosisReferralCard";
import { TreatmentCartSection } from "./review/TreatmentCartSection";
import { ReviewDecisionFooter } from "./review/ReviewDecisionFooter";
import { RequestDeleteDialog } from "./review/RequestDeleteDialog";

// Utilities
import {
  cleanPatientName,
  canDeleteRequestRecord,
} from "@/lib/clinicalUtils";

interface ReviewModalProps {
  request: any;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  otpValue?: string;
}

export function ReviewModal({ request, open, onClose, onUpdated, otpValue }: ReviewModalProps) {
  const { role } = useAuth();
  const [historyPage, setHistoryPage] = useState(1);
  const isPending = ["pending", "pending_referral", "pending_authorization", "info_provided"].includes(request?.status || "");
  const isDecided = !isPending;
  const [activeTab, setActiveTab] = useState(() => (isDecided ? "clinical" : "verification"));
  const [showStickyName, setShowStickyName] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 1. Determine request metadata
  const isHospitalDirected = ["hospital_portal", "hospital", "portal"].includes(request?.source);
  const requestPatientName = cleanPatientName(request?.patient_name || "");
  const requestPolicyNumber = String(request?.policy_number || "").trim();
  const requestDetailsLoaded = Boolean(
    request && Object.prototype.hasOwnProperty.call(request, "approved_items")
  );
  const isLocked = isDecided && !request?.is_unlocked;
  const isDeletionLocked = request?.deletion_status === "awaiting_admin_approval";
  const canManageClinicalCart = requestDetailsLoaded && role !== "hospital" && !isLocked && !isDeletionLocked;

  const formattedNotes = formatClinicalNotes(request?.decision_reason || request?.clinical_notes);

  // 1b. Look up the patient's registered primary hospital from nhis_beneficiaries
  const { primaryHospital, loading: primaryHospitalLoading } = usePrimaryHospitalLookup(open, requestPolicyNumber);

  // 1c. Look up the requesting hospital's hcp_code from the hospitals table
  const requestingHospitalCode = useRequestingHospitalCode({
    open,
    request,
    primaryHospitalHcpCode: primaryHospital?.hcp_code,
    primaryHospitalHcpName: primaryHospital?.hcp_name,
  });

  const requestingHospitalName = String(request?.hospital_name || request?.requesting_hospital_name || "").trim();

  const codeMatch = Boolean(
    requestingHospitalCode &&
    primaryHospital?.hcp_code &&
    requestingHospitalCode === primaryHospital.hcp_code
  );

  const namesMatch = areHospitalNamesMatching(requestingHospitalName, primaryHospital?.hcp_name);

  const primaryHospitalMismatch = Boolean(
    primaryHospital?.hcp_name &&
    requestingHospitalName &&
    !namesMatch &&
    !codeMatch
  );

  useEffect(() => {
    if (!open || !request) return;
    setActiveTab(isDecided ? "clinical" : "verification");
    setHistoryPage(1);
    setShowStickyName(false);

    const resetScroll = () => {
      scrollContainerRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    resetScroll();
    const frame = requestAnimationFrame(resetScroll);
    return () => cancelAnimationFrame(frame);
  }, [open, request?.id, isDecided]);

  // WhatsApp clinical recovery hook for diagnosis
  const [editDiagnosis, setEditDiagnosis] = useState("");

  const whatsappRecovery = useWhatsAppClinicalRecovery({
    open,
    request,
    requestDetailsLoaded,
    editDiagnosis,
    setEditDiagnosis,
  });

  // 2. Initialize treatment cart hook (handles tariff math, quantity editing, WhatsApp recovery sync)
  const treatmentCart = useTreatmentCart({
    open,
    request,
    canManageClinicalCart,
    isHospitalDirected,
    recoveredTreatment: whatsappRecovery.editTreatment,
  });

  // 3. Initialize decision & saving actions hook
  const actions = useClinicalActions({
    open,
    request,
    approvedItems: treatmentCart.approvedItems,
    approvedTotal: treatmentCart.approvedTotal,
    onClose,
    onUpdated,
    initialOtpValue: otpValue,
    editTreatment: treatmentCart.editTreatment,
    setEditTreatment: treatmentCart.setEditTreatment,
  });

  // Wire sync from local diagnosis state to actions
  useEffect(() => {
    if (editDiagnosis && !actions.editDiagnosis) {
      actions.setEditDiagnosis(editDiagnosis);
    }
  }, [editDiagnosis, actions]);

  const visibleOtpValue = otpValue || actions.arrivalOtp || actions.treatmentOtp;

  const { isResending, handleResendOtp } = usePatientArrivalPinResend({
    request,
    visibleOtpValue,
  });

  useEffect(() => {
    if (actions.approvalResult || actions.declineResult) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, 50);
    }
  }, [actions.approvalResult, actions.declineResult]);

  // 4. Initialize verification validation hook
  const verification = useClinicalVerification(open, request);

  // 5. Build combined history records
  const { visibleHistory } = useVisibleHistory(
    request,
    verification.sheetHistory,
    verification.localHistory
  );

  const allowDelete = canDeleteRequestRecord(request);
  const authorizationSlaMinutes = request && (isPending || request.decided_at)
    ? getAuthorizationSlaMinutes(request)
    : null;
  const decisionLabel = getAuthorizationDecisionLabel(request?.status) || "Decision";

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="h-[calc(100dvh_-_0.5rem)] w-[calc(100vw_-_0.5rem)] max-w-[calc(100vw_-_0.5rem)] max-h-[calc(100dvh_-_0.5rem)] rounded-xl border border-slate-200 bg-white p-0 shadow-xl ring-1 ring-slate-200 overflow-y-auto overflow-x-hidden overscroll-contain min-w-0 sm:h-[92dvh] sm:w-[94vw] sm:max-w-4xl sm:max-h-[92dvh] sm:rounded-2xl md:max-w-4xl lg:max-h-[48rem] lg:max-w-4xl [&_*]:min-w-0 [&>button.absolute.right-4]:hidden"
        ref={scrollContainerRef}
        onScroll={(e) => setShowStickyName((e.target as HTMLElement).scrollTop > 60)}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab as any} className="w-full min-w-0">
          {/* Fixed Header with SLA, Contact & Process Tracker */}
          <ReviewModalHeader
            request={request}
            requestPatientName={requestPatientName}
            requestPolicyNumber={requestPolicyNumber}
            showStickyName={showStickyName}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isDecided={isDecided}
            isPending={isPending}
            decisionLabel={decisionLabel}
            authorizationSlaMinutes={authorizationSlaMinutes}
            hasReviewResult={Boolean(actions.approvalResult || actions.declineResult)}
            onClose={onClose}
          />

          {/* Modal body container (Scrollable) */}
          <div className="w-full min-w-0 space-y-2.5 p-2 sm:space-y-3 sm:p-3.5">
            {/* Locked status warning */}
            {isDeletionLocked && (
              <div className="rounded-lg border border-slate-200 border-l-4 border-l-rose-700 bg-slate-50 px-3 py-2.5 text-xs text-slate-800 flex items-start gap-2.5 animate-in fade-in duration-200">
                <AlertTriangle className="mt-0.5 w-4 h-4 text-rose-800 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-slate-900">Awaiting deletion approval</p>
                  <p className="font-normal text-slate-600 mt-0.5">
                    This request has been requested for deletion and is awaiting admin approval. Modifications are disabled.
                  </p>
                </div>
              </div>
            )}

            {/* Referral declined status alert */}
            {request?.status === "referral_declined" && (
              <div className="rounded-lg border border-slate-200 border-l-4 border-l-amber-700 bg-slate-50 px-3 py-2.5 text-xs text-slate-800 flex items-start gap-2.5 animate-in fade-in duration-200">
                <AlertTriangle className="mt-0.5 w-4 h-4 text-amber-800 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-slate-900">Referral declined by hospital</p>
                  <p className="font-normal text-slate-600 mt-0.5">
                    Reason: <span className="font-medium text-slate-900">{request.decision_reason || "No reason provided"}</span>
                  </p>
                  <p className="font-medium text-slate-700 mt-1">
                    Please select a new referred hospital in the section below and click "Reassign Referral" to route it to another facility.
                  </p>
                </div>
              </div>
            )}

            {/* Success template overlays after approval/decline */}
            {actions.approvalResult || actions.declineResult ? (
              <PostReviewTemplates
                request={request}
                approvalResult={actions.approvalResult}
                declineResult={actions.declineResult}
                copyApprovalMessage={actions.copyApprovalMessage}
                copyDeclineMessage={actions.copyDeclineMessage}
                setApprovalResult={actions.setApprovalResult}
                setDeclineResult={actions.setDeclineResult}
                onClose={onClose}
                allowDelete={allowDelete}
                setDeleteConfirmOpen={actions.setDeleteConfirmOpen}
                processing={actions.processing}
                editReferralHospitalName={actions.editReferralHospitalName}
                arrivalPin={visibleOtpValue ?? undefined}
                isResendingPin={isResending}
                onResendPin={handleResendOtp}
              />
            ) : (
              <>
                {/* ─── Tab 1: Patient Verify & History ─── */}
                <TabsContent value="verification" className="space-y-4 mt-0">
                  <PatientVerifyCard
                    request={request}
                    checking={verification.checking}
                    verificationLoadFailed={verification.verificationLoadFailed}
                    onRetryVerification={() => void verification.runVerificationSuite()}
                    patientMatchStatus={verification.patientMatchStatus}
                    matchedMemberId={verification.matchedMemberId}
                    policyVerified={verification.policyVerified}
                    nhisVerified={verification.nhisVerified}
                    familyMembers={verification.familyMembers}
                    earlyRefill={verification.earlyRefill}
                    requestPolicyNumber={requestPolicyNumber}
                    primaryHospitalLoading={primaryHospitalLoading}
                    primaryHospital={primaryHospital}
                    primaryHospitalMismatch={primaryHospitalMismatch}
                    requestingHospitalName={requestingHospitalName}
                    requestingHospitalCode={requestingHospitalCode ?? undefined}
                  />

                  <ClinicalHistory
                    request={request}
                    visibleHistory={visibleHistory}
                    historyPage={historyPage}
                    setHistoryPage={setHistoryPage}
                    requestPatientName={requestPatientName}
                    requestPolicyNumber={requestPolicyNumber}
                    requestBeneficiaryNumber={verification.matchedBeneficiaryNumber || request?.beneficiary_number || null}
                    familyMembers={verification.familyMembers}
                    checking={verification.historyChecking}
                    historyLoadFailed={verification.historyLoadFailed}
                    onRetryHistory={() => void verification.runHistoryLookup()}
                  />

                  {/* Tab 1 footer: Close + Next */}
                  <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-slate-100">
                    <Button
                      variant="outline"
                      className="h-11 sm:h-12 px-6 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-widest border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                      onClick={onClose}
                    >
                      Close
                    </Button>
                    <Button
                      className="h-11 sm:h-12 px-6 sm:px-8 rounded-xl bg-slate-900 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md hover:bg-slate-950 active:scale-95 transition-all"
                      onClick={() => setActiveTab("clinical")}
                    >
                      Next
                    </Button>
                  </div>
                </TabsContent>

                {/* ─── Tab 2: Clinical Review ─── */}
                <TabsContent value="clinical" className="space-y-4 mt-0">
                  {/* Locked & Unlocked record banners */}
                  <ClinicalLockBanners
                    request={request}
                    role={role}
                    isLocked={isLocked}
                    isDecided={isDecided}
                    unlockLoading={actions.unlockLoading}
                    onUnlockRecord={actions.handleUnlockRecord}
                    onLockRecord={actions.handleLockRecord}
                    requestingHospitalName={requestingHospitalName}
                    primaryHospital={primaryHospital}
                    formattedNotes={formattedNotes}
                  />

                  {/* OTP / Arrival Pin Banner */}
                  <ArrivalPinBanner
                    visibleOtpValue={visibleOtpValue}
                    request={request}
                    hasApprovalResult={Boolean(actions.approvalResult)}
                  />

                  {/* Diagnosis & Referral Card */}
                  <DiagnosisReferralCard
                    request={request}
                    role={role}
                    requestDetailsLoaded={requestDetailsLoaded}
                    isHospitalDirected={isHospitalDirected}
                    isLocked={isLocked}
                    isDeletionLocked={isDeletionLocked}
                    editDiagnosis={actions.editDiagnosis}
                    setEditDiagnosis={actions.setEditDiagnosis}
                    editTreatment={treatmentCart.editTreatment}
                    setEditTreatment={treatmentCart.setEditTreatment}
                    onBlurTreatment={treatmentCart.handleBlurParseTreatment}
                    referralCollapsed={actions.referralCollapsed}
                    setReferralCollapsed={actions.setReferralCollapsed}
                    editReferralHospitalName={actions.editReferralHospitalName}
                    setEditReferralHospitalName={actions.setEditReferralHospitalName}
                    editReferralHospitalId={actions.editReferralHospitalId}
                    setEditReferralHospitalId={actions.setEditReferralHospitalId}
                  />

                  {/* Treatment Cart Component */}
                  <TreatmentCartSection
                    request={request}
                    requestDetailsLoaded={requestDetailsLoaded}
                    isHospitalDirected={isHospitalDirected}
                    isLocked={isLocked}
                    isDeletionLocked={isDeletionLocked}
                    treatmentCart={treatmentCart}
                  />

                  {/* Decision Note & Action Buttons Footer */}
                  <ReviewDecisionFooter
                    request={request}
                    role={role}
                    isLocked={isLocked}
                    isDecided={isDecided}
                    isDeletionLocked={isDeletionLocked}
                    requestDetailsLoaded={requestDetailsLoaded}
                    editDecisionNote={actions.editDecisionNote}
                    setEditDecisionNote={actions.setEditDecisionNote}
                    processing={actions.processing}
                    processingAction={actions.processingAction}
                    unlockLoading={actions.unlockLoading}
                    onUnlockRecord={actions.handleUnlockRecord}
                    onDecline={actions.handleDecline}
                    onApprove={actions.handleApprove}
                    onClose={onClose}
                  />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </DialogContent>

      {/* Delete confirmation modal */}
      <RequestDeleteDialog
        open={actions.deleteConfirmOpen}
        onOpenChange={actions.setDeleteConfirmOpen}
        deleteConfirmText={actions.deleteConfirmText}
        setDeleteConfirmText={actions.setDeleteConfirmText}
        onDeleteRequest={actions.handleDeleteRequest}
        processing={actions.processing}
      />
    </Dialog>
  );
}
