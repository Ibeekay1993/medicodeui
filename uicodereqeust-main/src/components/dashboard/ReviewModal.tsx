import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HospitalReferralField } from "@/components/HospitalReferralField";
import { AlertTriangle, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";

// Custom Hooks
import { useAuth } from "@/contexts/AuthContext";
import { useClinicalVerification } from "@/hooks/clinical/useClinicalVerification";
import { useTariffSearch } from "@/hooks/clinical/useTariffSearch";
import { useClinicalActions } from "@/hooks/clinical/useClinicalActions";

// Modular Sub-components
import { PatientVerifyCard } from "./review/PatientVerifyCard";
import { TreatmentCart } from "./review/TreatmentCart";
import { ClinicalHistory } from "./review/ClinicalHistory";
import { ClinicalActionControls } from "./review/ClinicalActionControls";
import { PostReviewTemplates } from "./review/PostReviewTemplates";

// Utilities
import {
  cleanPatientName,
  canDeleteRequestRecord,
  recordMatchesHistory,
  normalizePolicyNumber,
} from "@/lib/clinicalUtils";

interface ReviewModalProps {
  request: any;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function ReviewModal({ request, open, onClose, onUpdated }: ReviewModalProps) {
  const { role } = useAuth();
  const [historyPage, setHistoryPage] = useState(1);

  // 1. Determine request metadata
  const isHospitalDirected = request?.source === "hospital_portal";
  const requestPatientName = cleanPatientName(request?.patient_name || "");
  const requestPolicyNumber = String(request?.policy_number || "").trim();

  // 2. Initialize manual/auto tariff search hook
  const tariffSearch = useTariffSearch(open, request?.treatment || "", request, isHospitalDirected);

  // 3. Initialize decision & saving actions hook
  const actions = useClinicalActions({
    open,
    request,
    approvedItems: tariffSearch.approvedItems,
    approvedTotal: tariffSearch.approvedTotal,
    onClose,
    onUpdated,
  });

  // 4. Initialize verification validation hook
  const verification = useClinicalVerification(open, request);

  // 5. Build combined history records
  const targetPolicy = useMemo(() => normalizePolicyNumber(request?.policy_number), [request]);
  
  const visibleHistory = useMemo(() => {
    const combined = [...verification.sheetHistory, ...verification.localHistory].filter((record) =>
      recordMatchesHistory(record, targetPolicy)
    );
    return combined.filter((record, index, arr) => {
      const key = `${record?.request_id || ""}|${record?.authorization_code || ""}|${
        record?.date || record?.created_at || ""
      }|${record?.patient_name || ""}`;
      return (
        index ===
        arr.findIndex(
          (item) =>
            `${item?.request_id || ""}|${item?.authorization_code || ""}|${
              item?.date || item?.created_at || ""
            }|${item?.patient_name || ""}` === key
        )
      );
    });
  }, [verification.sheetHistory, verification.localHistory, targetPolicy]);

  const allowDelete = canDeleteRequestRecord(request);

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[94vw] max-w-[94vw] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl max-h-[92dvh] overflow-y-auto overflow-x-hidden rounded-2xl sm:rounded-3xl border-primary/20 bg-background/95 backdrop-blur-xl selection:bg-primary/20 p-0 shadow-2xl">
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 px-4 py-3 bg-background/95 backdrop-blur-md border-b border-slate-100 rounded-t-2xl shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-primary/80 uppercase tracking-widest">
                Clinical Review
              </div>
              <h2 className="text-[10px] sm:text-base font-extrabold text-slate-905 leading-tight line-clamp-2 mt-0.5">
                {requestPatientName || "Unknown Patient"}
              </h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-mono font-bold text-slate-800 border border-slate-200 shadow-2xs">
                  Policy: {requestPolicyNumber || "N/A"}
                </span>
                {(request?.status === "pending" || request?.status === "pending_referral" || request?.status === "pending_authorization") && role !== "hospital" ? (
                  <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 border border-amber-250 shadow-2xs">
                    {actions.otpLoading ? (
                      <span className="animate-pulse">Generating OTP…</span>
                    ) : actions.otpValue ? (
                      <span className="tracking-wider">OTP: {actions.otpValue}</span>
                    ) : (
                      <span>OTP: ••••••</span>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500 border border-slate-200/30">
                    OTP: —
                  </span>
                )}
              </div>
            </div>

            <div className="text-right min-w-[120px] bg-slate-50/50 border border-slate-100 p-2 rounded-xl text-slate-600 shadow-2xs shrink-0 self-center">
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Contact Details</div>
              <div className="text-xs font-bold text-slate-750 truncate leading-none">
                {request?.patient_phone ? `☎ ${request.patient_phone}` : "—"}
              </div>
              {request?.patient_email && (
                <div className="text-xs font-medium text-slate-550 truncate mt-1 leading-none">
                  {request.patient_email}
                </div>
              )}
            </div>
          </div>

          {/* Process Tracker */}
          {request?.referred_hospital_name ? (
            <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-row items-start justify-between w-full text-center text-[7px] sm:text-[9px] md:text-xs font-black uppercase tracking-wider text-slate-400">
              <div className={cn("flex flex-col items-center gap-1 sm:gap-1.5 w-[18%]", ["pending_referral"].includes(request.status) ? "text-blue-600 animate-pulse font-bold" : "text-emerald-600")}>
                <span className={cn("h-4 w-4 md:h-5 md:w-5 shrink-0 rounded-full flex items-center justify-center border font-bold text-[8px] md:text-xs", ["pending_referral"].includes(request.status) ? "bg-blue-50 border-blue-200" : "bg-emerald-50 border-emerald-200")}>1</span>
                <span className="leading-tight">Referral Requested</span>
              </div>
              <div className="flex justify-center items-center mt-1.5 sm:mt-2 text-slate-300"><ChevronRight className="w-3 h-3 md:w-4 md:h-4" /></div>

              <div className={cn("flex flex-col items-center gap-1 sm:gap-1.5 w-[18%]", ["referral_approved"].includes(request.status) ? "text-blue-600 animate-pulse font-bold" : ["pending_referral"].includes(request.status) ? "text-slate-300" : "text-emerald-600")}>
                <span className={cn("h-4 w-4 md:h-5 md:w-5 shrink-0 rounded-full flex items-center justify-center border font-bold text-[8px] md:text-xs", ["referral_approved"].includes(request.status) ? "bg-blue-50 border-blue-200" : ["pending_referral"].includes(request.status) ? "bg-slate-50 border-slate-200" : "bg-emerald-50 border-emerald-200")}>2</span>
                <span className="leading-tight">Insurer Approved</span>
              </div>
              <div className="flex justify-center items-center mt-1.5 sm:mt-2 text-slate-300"><ChevronRight className="w-3 h-3 md:w-4 md:h-4" /></div>

              <div className={cn("flex flex-col items-center gap-1 sm:gap-1.5 w-[18%]", ["referral_accepted"].includes(request.status) ? "text-blue-600 animate-pulse font-bold" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired"].includes(request.status) ? "text-slate-300" : "text-emerald-600")}>
                <span className={cn("h-4 w-4 md:h-5 md:w-5 shrink-0 rounded-full flex items-center justify-center border font-bold text-[8px] md:text-xs", ["referral_accepted"].includes(request.status) ? "bg-blue-50 border-blue-200" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired"].includes(request.status) ? "bg-slate-50 border-slate-200" : "bg-emerald-50 border-emerald-200")}>3</span>
                <span className="leading-tight">Hospital Accepted</span>
              </div>
              <div className="flex justify-center items-center mt-1.5 sm:mt-2 text-slate-300"><ChevronRight className="w-3 h-3 md:w-4 md:h-4" /></div>

              <div className={cn("flex flex-col items-center gap-1 sm:gap-1.5 w-[18%]", ["pending_authorization"].includes(request.status) ? "text-blue-600 animate-pulse font-bold" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired", "referral_accepted", "accepted_referral_expired"].includes(request.status) ? "text-slate-300" : "text-emerald-600")}>
                <span className={cn("h-4 w-4 md:h-5 md:w-5 shrink-0 rounded-full flex items-center justify-center border font-bold text-[8px] md:text-xs", ["pending_authorization"].includes(request.status) ? "bg-blue-50 border-blue-200" : ["pending_referral", "referral_approved", "referral_declined", "referral_expired", "referral_accepted", "accepted_referral_expired"].includes(request.status) ? "bg-slate-50 border-slate-200" : "bg-emerald-50 border-emerald-200")}>4</span>
                <span className="leading-tight">Treatment Review</span>
              </div>
              <div className="flex justify-center items-center mt-1.5 sm:mt-2 text-slate-300"><ChevronRight className="w-3 h-3 md:w-4 md:h-4" /></div>

              <div className={cn("flex flex-col items-center gap-1 sm:gap-1.5 w-[18%]", ["approved", "authorization_approved"].includes(request.status) ? "text-emerald-600 font-bold" : "text-slate-300")}>
                <span className={cn("h-4 w-4 md:h-5 md:w-5 shrink-0 rounded-full flex items-center justify-center border font-bold text-[8px] md:text-xs", ["approved", "authorization_approved"].includes(request.status) ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200")}>5</span>
                <span className="leading-tight">Authorized</span>
              </div>
            </div>
          ) : (
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-start justify-between w-full text-center text-[8px] sm:text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400">
              <div className="flex flex-col items-center gap-1 w-1/3 text-primary">
                <span className="h-4 w-4 md:h-5 md:w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] md:text-xs font-black border border-primary/20">1</span>
                <span className="leading-tight">Verify Patient</span>
              </div>
              <div className="flex justify-center items-center mt-1.5 sm:mt-2 text-slate-200"><ChevronRight className="w-3 h-3 md:w-4 md:h-4" /></div>
              
              <div className="flex flex-col items-center gap-1 w-1/3 text-slate-500">
                <span className="h-4 w-4 md:h-5 md:w-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[8px] md:text-xs font-black border border-slate-200/60">2</span>
                <span className="leading-tight">Review Treatment</span>
              </div>
              <div className="flex justify-center items-center mt-1.5 sm:mt-2 text-slate-200"><ChevronRight className="w-3 h-3 md:w-4 md:h-4" /></div>
              
              <div className="flex flex-col items-center gap-1 w-1/3 text-slate-500">
                <span className="h-4 w-4 md:h-5 md:w-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[8px] md:text-xs font-black border border-slate-200/60">3</span>
                <span className="leading-tight">Make Decision</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal body container */}
        <div className="p-3 sm:p-5 space-y-4">
          {/* Locked status warning */}
          {request?.deletion_status === "awaiting_admin_approval" && (
            <div className="p-4 rounded-2xl text-xs border bg-rose-50 border-rose-250 flex items-center gap-3 text-rose-900 shadow-xs animate-in fade-in duration-350">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
              <div>
                <p className="font-black uppercase tracking-wider text-xs text-rose-800">Awaiting Deletion Approval</p>
                <p className="font-medium opacity-80 mt-0.5">
                  This request has been requested for deletion and is awaiting admin approval. Modifications are disabled.
                </p>
              </div>
            </div>
          )}

          {/* Referral declined status alert */}
          {request?.status === "referral_declined" && (
            <div className="p-4 rounded-2xl text-xs border bg-amber-50 border-amber-200 flex items-center gap-3 text-amber-900 shadow-xs animate-in fade-in duration-350">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-black uppercase tracking-wider text-xs text-amber-800">Referral Declined by Hospital</p>
                <p className="font-medium opacity-90 mt-0.5">
                  Decline Reason: <span className="font-bold text-slate-800">{request.decision_reason || "No reason provided"}</span>
                </p>
                <p className="font-semibold text-amber-800 mt-1">
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
              nurseDisplayName={actions.nurseDisplayName}
              nurseInitials={actions.nurseInitials}
            />
          ) : (
            /* Main Clinical Review Layout Form */
            <div className="space-y-4">
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-y-3.5 gap-x-4 md:gap-x-6">
                <div className="col-span-2 space-y-3.5">
                  {/* Diagnosis field */}
                  <div className="space-y-1">
                    <Label className="text-xs uppercase font-black text-slate-400 tracking-wider pl-1">
                      Diagnosis
                    </Label>
                    <Input
                      placeholder="Diagnosis..."
                      value={actions.editDiagnosis}
                      onChange={(e) => actions.setEditDiagnosis(e.target.value)}
                      className="bg-white rounded-xl border-slate-200 font-bold focus:ring-primary/20"
                      disabled={request?.deletion_status === "awaiting_admin_approval"}
                    />
                  </div>

                  {/* Treatment text area */}
                  <div className="space-y-1">
                    <Label className="text-xs uppercase font-black text-slate-400 tracking-wider pl-1">
                      Services / Treatment
                    </Label>
                    <Textarea
                      placeholder="Treatment Plan..."
                      value={actions.editTreatment}
                      onChange={(e) => actions.setEditTreatment(e.target.value)}
                      onBlur={() => {
                        if (isHospitalDirected) return;
                        void tariffSearch.parseTreatmentText({ replaceAuto: true, quiet: true });
                      }}
                      className="bg-white rounded-xl border-slate-200 font-semibold min-h-[80px] focus:ring-primary/20"
                      disabled={request?.deletion_status === "awaiting_admin_approval"}
                    />
                  </div>

                  {/* Referral details container */}
                  <div className="space-y-3.5 overflow-hidden rounded-2xl border border-blue-100 bg-white p-3 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-widest text-blue-800">
                          Referral Hospital / Claim Owner
                        </div>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500">
                          {actions.referralCollapsed
                            ? "Tap arrow to view referral details"
                            : "Specify treating hospital details if this authorization requires a referral."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => actions.setReferralCollapsed((current) => !current)}
                        className="h-8 w-8 shrink-0 rounded-xl text-blue-700 hover:bg-blue-50"
                      >
                        {actions.referralCollapsed ? (
                          <ChevronDown className="h-4.5 w-4.5" />
                        ) : (
                          <ChevronUp className="h-4.5 w-4.5" />
                        )}
                      </Button>
                    </div>

                    {!actions.referralCollapsed && (
                      <div className="mt-3.5 space-y-3 animate-in fade-in duration-200">
                        <HospitalReferralField
                          label="Referral Hospital / Claim Owner"
                          value={actions.editReferralHospitalName}
                          selectedId={actions.editReferralHospitalId}
                          onChange={(next) => {
                            actions.setEditReferralHospitalId(next.id);
                            actions.setEditReferralHospitalName(next.name);
                          }}
                          helperText="If this is a referral, the authorization code remains visible to the requester, but claim submission and payment belong only to this treating hospital."
                          disabled={request?.deletion_status === "awaiting_admin_approval"}
                        />
                        {actions.editReferralHospitalName.trim() ? (
                          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-bold leading-relaxed text-blue-900 shadow-inner">
                            Request raised by: {request.requesting_hospital_name || request.hospital_name || "Original hospital"}
                            <br />
                            Treatment and claims assigned to: {actions.editReferralHospitalName.trim()}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-500">
                            No referral selected. Claims stay with {request.hospital_name || "the requesting hospital"}.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Treatment matched cart details */}
                  <TreatmentCart
                    request={request}
                    editTreatment={actions.editTreatment}
                    setEditTreatment={actions.setEditTreatment}
                    isHospitalDirected={isHospitalDirected}
                    parseLoading={tariffSearch.parseLoading}
                    parseStatus={tariffSearch.parseStatus}
                    parseTreatmentText={tariffSearch.parseTreatmentText}
                    approvedItems={tariffSearch.approvedItems}
                    approvedTotal={tariffSearch.approvedTotal}
                    editingQuantities={tariffSearch.editingQuantities}
                    updateApprovedItemQuantity={tariffSearch.updateApprovedItemQuantity}
                    commitQuantity={tariffSearch.commitQuantity}
                    removeApprovedItem={tariffSearch.removeApprovedItem}
                    toggleDeclineApprovedItem={tariffSearch.toggleDeclineApprovedItem}
                    updateDeclineReason={tariffSearch.updateDeclineReason}
                    tariffSearch={tariffSearch.tariffSearch}
                    setTariffSearch={tariffSearch.setTariffSearch}
                    tariffOptions={tariffSearch.tariffOptions}
                    setTariffOptions={tariffSearch.setTariffOptions}
                    tariffSearchLoading={tariffSearch.tariffSearchLoading}
                    addApprovedItem={tariffSearch.addApprovedItem}
                    cartCollapsed={tariffSearch.cartCollapsed}
                    setCartCollapsed={tariffSearch.setCartCollapsed}
                  />
                </div>

                {/* Original Hospital and Priority labels */}
                <div className="space-y-1 min-w-0">
                  <span className="text-xs uppercase font-black text-slate-400 tracking-wider pl-1">
                    Hospital
                  </span>
                  <p className="px-3.5 py-2.5 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 truncate shadow-xs">
                    {request.hospital_name || "N/A"}
                  </p>
                </div>
                <div className="space-y-1 text-center">
                  <span className="text-xs uppercase font-black text-slate-400 tracking-wider">
                    Priority
                  </span>
                  <div className="flex justify-center mt-0.5">
                    <Badge
                      variant={request.urgency === "urgent" ? "destructive" : "outline"}
                      className="px-4 py-1.5 rounded-full uppercase text-xs font-black border-slate-200 shadow-xs"
                    >
                      {request.urgency || "ROUTINE"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Patient registry NHIS verify card */}
              <PatientVerifyCard
                request={request}
                checking={verification.checking}
                patientMatchStatus={verification.patientMatchStatus}
                policyVerified={verification.policyVerified}
                nhisVerified={verification.nhisVerified}
                familyMembers={verification.familyMembers}
                earlyRefill={verification.earlyRefill}
                requestPatientName={requestPatientName}
                requestPolicyNumber={requestPolicyNumber}
              />



              {/* Local and spreadsheet claims history */}
              <ClinicalHistory
                request={request}
                visibleHistory={visibleHistory}
                historyPage={historyPage}
                setHistoryPage={setHistoryPage}
                requestPatientName={requestPatientName}
                requestPolicyNumber={requestPolicyNumber}
              />

              {/* Review decisions control footer */}
              <ClinicalActionControls
                request={request}
                editDecisionNote={actions.editDecisionNote}
                setEditDecisionNote={actions.setEditDecisionNote}
                processing={actions.processing}
                processingAction={actions.processingAction}
                allowDelete={allowDelete}
                setDeleteConfirmOpen={actions.setDeleteConfirmOpen}
                handleApprove={actions.handleApprove}
                handleDecline={actions.handleDecline}
                handleReassign={actions.handleReassign}
                saveRecordEdits={actions.saveRecordEdits}
                onClose={onClose}
                approvalResult={actions.approvalResult}
                declineResult={actions.declineResult}
              />
            </div>
          )}
        </div>
      </DialogContent>

      {/* Delete confirmation modal */}
      <AlertDialog
        open={actions.deleteConfirmOpen}
        onOpenChange={(openState) => {
          actions.setDeleteConfirmOpen(openState);
          if (!openState) actions.setDeleteConfirmText("");
        }}
      >
        <AlertDialogContent className="rounded-2xl border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request</AlertDialogTitle>
            <AlertDialogDescription>
              This action is permanent and cannot be undone. Type{" "}
              <span className="font-black text-slate-900">DELETE</span> to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={actions.deleteConfirmText}
            onChange={(e) => actions.setDeleteConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="h-10 rounded-xl"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actions.processing} className="rounded-xl">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={actions.processing || actions.deleteConfirmText.trim() !== "DELETE"}
              onClick={actions.handleDeleteRequest}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold"
            >
              {actions.processing ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
