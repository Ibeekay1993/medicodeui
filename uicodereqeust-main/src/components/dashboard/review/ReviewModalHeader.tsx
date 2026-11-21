import React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  authorizationSlaColor,
  formatAuthorizationSla,
  formatNigeriaDateTime,
} from "@/lib/authorizationTime";

interface ReviewModalHeaderProps {
  request: any;
  requestPatientName: string;
  requestPolicyNumber: string;
  showStickyName: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isDecided: boolean;
  isPending: boolean;
  decisionLabel: string;
  authorizationSlaMinutes: number | null;
  hasReviewResult: boolean;
  onClose: () => void;
}

export const ReviewModalHeader = React.memo(function ReviewModalHeader({
  request,
  requestPatientName,
  requestPolicyNumber,
  showStickyName,
  activeTab,
  setActiveTab,
  isDecided,
  isPending,
  decisionLabel,
  authorizationSlaMinutes,
  hasReviewResult,
  onClose,
}: ReviewModalHeaderProps) {
  return (
    <>
      {/* Sticky patient name on scroll */}
      <div className="sticky top-0 z-[100] w-full h-0 pointer-events-none">
        <div
          className={cn(
            "absolute top-0 left-0 right-0 rounded-t-xl border-b border-slate-200 bg-white px-5 py-2 transition-opacity duration-200 ease-in-out pointer-events-auto sm:rounded-t-2xl",
            showStickyName ? "opacity-100" : "opacity-0"
          )}
        >
          <p className="break-words text-center text-xs font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere] sm:text-[13px]">
            {requestPatientName || "Unknown Patient"}
          </p>
        </div>
      </div>

      {/* Fixed Header */}
      <div className="relative z-30 flex w-full min-w-0 shrink-0 flex-col gap-2 border-b border-slate-200 px-2.5 pb-2 pt-2.5 sm:px-4 sm:pt-3">
        <button
          onClick={onClose}
          type="button"
          aria-label="Close authorization review"
          className="absolute right-3 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 flex-col gap-2 pr-14 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:pr-14">
          <div className="min-w-0 flex-1 w-full">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-[11px] sm:tracking-widest">
              Clinical Review
            </div>
            <h2 className="break-words text-base font-semibold leading-tight text-slate-900 [overflow-wrap:anywhere] sm:text-xl">
              {requestPatientName || "Unknown Patient"}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>Policy: {requestPolicyNumber || "N/A"}</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-left text-[11px] sm:mt-0 sm:w-full sm:max-w-[200px] sm:shrink-0 sm:flex-col sm:items-end sm:text-right sm:text-xs">
            <div className="font-medium text-slate-600">Contact</div>
            <div className="min-w-0 break-words font-semibold text-slate-700 [overflow-wrap:anywhere]" title={request?.patient_phone || undefined}>
              {request?.patient_phone ? `${request.patient_phone}` : "—"}
            </div>
            {request?.patient_email && (
              <div className="min-w-0 break-words text-[10px] font-medium leading-tight text-slate-500 [overflow-wrap:anywhere] sm:mt-0.5 sm:text-[11px]" title={request.patient_email}>
                {request.patient_email === "no-email@ronsbergerhmo.io" || request.patient_email.startsWith("no-email@") || request.patient_email.endsWith("@medicode.com") ? (
                  <span className="italic opacity-70">No email provided</span>
                ) : (
                  request.patient_email
                )}
              </div>
            )}
          </div>
        </div>

        <div className={cn(
          "grid grid-cols-3 gap-x-2 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 sm:gap-x-4 sm:px-3",
          request?.treatment_submitted_at ? "sm:grid-cols-4" : "sm:grid-cols-3"
        )}>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Submitted</div>
            <div className="mt-0.5 break-words text-xs font-medium leading-4 text-slate-800">{formatNigeriaDateTime(request?.created_at)}</div>
          </div>
          {request?.treatment_submitted_at && (
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Treatment submitted</div>
              <div className="mt-0.5 break-words text-xs font-medium leading-4 text-slate-800">{formatNigeriaDateTime(request.treatment_submitted_at)}</div>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{decisionLabel}</div>
            <div className="mt-0.5 break-words text-xs font-medium leading-4 text-slate-800">
              {request?.decided_at
                ? formatNigeriaDateTime(request.decided_at)
                : isPending ? "Awaiting decision" : "Decision time unavailable"}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{request?.decided_at || !isPending ? "Turnaround" : "SLA elapsed"}</div>
            <div className={cn(
              "mt-0.5 text-xs font-bold leading-4",
              authorizationSlaMinutes === null ? "text-slate-500" : authorizationSlaColor(authorizationSlaMinutes)
            )}>
              {authorizationSlaMinutes === null
                ? "—"
                : `${formatAuthorizationSla(authorizationSlaMinutes)}${request?.decided_at || !isPending ? "" : " so far"}`}
            </div>
          </div>
        </div>

        {/* Process Tracker */}
        {!hasReviewResult && (
          <>
            {request?.referred_hospital_name ? (
              <div className="flex justify-center items-center gap-1 sm:gap-2 px-2 sm:px-6 py-2 w-full">
                {/* Step 1: Referral */}
                <div className="flex flex-col items-center gap-1 min-w-0">
                  <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["pending_referral"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : "bg-slate-800")} />
                  <span className={cn("text-[10px] sm:text-xs font-medium normal-case", ["pending_referral"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Referral</span>
                </div>
                <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["referral_approved", "referral_accepted", "pending_authorization", "approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />

                {/* Step 2: Insurer */}
                <div className="flex flex-col items-center gap-1 min-w-0">
                  <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["referral_approved"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["pending_referral"].includes(request.status) ? "bg-slate-200" : "bg-slate-800")} />
                  <span className={cn("text-[10px] sm:text-xs font-medium normal-case", ["referral_approved"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Insurer</span>
                </div>
                <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["referral_accepted", "pending_authorization", "approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />

                {/* Step 3: Hospital */}
                <div className="flex flex-col items-center gap-1 min-w-0">
                  <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["referral_accepted"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["pending_referral", "referral_approved"].includes(request.status) ? "bg-slate-200" : "bg-slate-800")} />
                  <span className={cn("text-[10px] sm:text-xs font-medium normal-case", ["referral_accepted"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Hospital</span>
                </div>
                <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["pending_authorization", "approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />

                {/* Step 4: Review */}
                <div className="flex flex-col items-center gap-1 min-w-0">
                  <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["pending_authorization"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["approved", "partially_approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
                  <span className={cn("text-[10px] sm:text-xs font-medium normal-case", ["pending_authorization"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Review</span>
                </div>
                <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["approved", "partially_approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />

                {/* Step 5: Authorized */}
                <div className="flex flex-col items-center gap-1 min-w-0">
                  <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["approved", "partially_approved", "authorization_approved"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : "bg-slate-200")} />
                  <span className={cn("text-[10px] sm:text-xs font-medium normal-case", ["approved", "partially_approved", "authorization_approved"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Authorized</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-center items-center gap-1 sm:gap-2 px-2 sm:px-6 py-2">
                {/* Step 1: Verify */}
                <button
                  type="button"
                  aria-pressed={activeTab === "verification"}
                  className="flex min-w-0 flex-col items-center gap-1 rounded-md bg-transparent p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => setActiveTab("verification")}
                >
                  <div className={cn(
                    "rounded-full transition-all flex items-center justify-center font-bold text-[9px]",
                    isDecided
                      ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-emerald-600 text-white"
                      : activeTab === "verification"
                      ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-900 text-slate-900"
                      : "w-2.5 h-2.5 sm:w-3 sm:h-3 bg-slate-800"
                  )}>
                    {isDecided ? "✓" : null}
                  </div>
                  <span className={cn(
                    "text-[10px] sm:text-xs font-medium normal-case",
                    isDecided
                      ? "text-emerald-700"
                      : activeTab === "verification"
                      ? "text-slate-900"
                      : "text-slate-500"
                  )}>
                    Verify
                  </span>
                </button>

                {/* Line 1-2 */}
                <div className={cn(
                  "w-8 sm:w-10 h-[2px] mb-4 transition-colors duration-300",
                  isDecided
                    ? "bg-emerald-600"
                    : activeTab === "clinical"
                    ? "bg-slate-800"
                    : "bg-slate-200"
                )} />

                {/* Step 2: Review */}
                <button
                  type="button"
                  aria-pressed={activeTab === "clinical"}
                  className="flex min-w-0 flex-col items-center gap-1 rounded-md bg-transparent p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => setActiveTab("clinical")}
                >
                  <div className={cn(
                    "rounded-full transition-all flex items-center justify-center font-bold text-[9px]",
                    isDecided
                      ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-emerald-600 text-white"
                      : activeTab === "clinical"
                      ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-900 text-slate-900"
                      : "w-2.5 h-2.5 sm:w-3 sm:h-3 bg-slate-300"
                  )}>
                    {isDecided ? "✓" : null}
                  </div>
                  <span className={cn(
                    "text-[10px] sm:text-xs font-medium normal-case",
                    isDecided
                      ? "text-emerald-700"
                      : activeTab === "clinical"
                      ? "text-slate-900"
                      : "text-slate-400"
                  )}>
                    Review
                  </span>
                </button>

                {/* Line 2-3 */}
                <div className={cn(
                  "w-8 sm:w-10 h-[2px] mb-4 transition-colors duration-300",
                  isDecided
                    ? (request?.status === "rejected" ? "bg-rose-600" : "bg-emerald-600")
                    : "bg-slate-200"
                )} />

                {/* Step 3: Decision */}
                <div className="flex flex-col items-center gap-1">
                  <div className={cn(
                    "rounded-full transition-all flex items-center justify-center font-bold text-[9px]",
                    isDecided
                      ? (request?.status === "rejected" ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-rose-600 text-white" : "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-emerald-600 text-white")
                      : "w-2.5 h-2.5 sm:w-3 sm:h-3 bg-slate-300"
                  )}>
                    {isDecided ? (request?.status === "rejected" ? "✗" : "✓") : null}
                  </div>
                  <span className={cn(
                    "text-[10px] sm:text-xs font-medium normal-case",
                    isDecided
                      ? (request?.status === "rejected" ? "text-rose-700" : "text-emerald-700")
                      : "text-slate-400"
                  )}>
                    {isDecided
                      ? (request?.status === "rejected" ? "Declined" : request?.status === "partially_approved" ? "Partially Approved" : "Approved")
                      : "Decision"}
                  </span>
                </div>
              </div>
            )}

            {/* TabsList */}
            <TabsList className="grid h-auto w-full grid-cols-2 bg-slate-100 p-1 gap-1 mt-3 rounded-lg sm:h-10">
              <TabsTrigger
                value="verification"
                className="h-11 min-w-0 w-full whitespace-normal break-words rounded-md px-1 py-0 text-center text-[11px] font-bold leading-tight text-slate-600 transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-200/70 active:bg-slate-200 sm:h-full sm:whitespace-nowrap sm:px-4 sm:text-xs"
              >
                Patient Verify & History
              </TabsTrigger>
              <TabsTrigger
                value="clinical"
                className="h-11 min-w-0 w-full whitespace-normal break-words rounded-md px-1 py-0 text-center text-[11px] font-bold leading-tight text-slate-600 transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-200/70 active:bg-slate-200 sm:h-full sm:whitespace-nowrap sm:px-4 sm:text-xs"
              >
                Clinical Review
              </TabsTrigger>
            </TabsList>
          </>
        )}
      </div>
    </>
  );
});
