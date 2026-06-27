import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowLeft, Link2, Search, X } from "lucide-react";
import { getDecisionReason } from "@/lib/support-helpers";

interface SupportDetailsSidebarProps {
  selected: any | null;
  role: string | null;
  isInternal: boolean;
  matchedRequest: any | null;
  matchedClaim: any | null;
  authRequests: any[];
  claims: any[];
  rightCollapsed: boolean;
  setRightCollapsed: (c: boolean) => void;
  setMobileSubView: (v: string) => void;
  mobileSubView: string;
  handleLinkCase: (id: string, type: "request" | "claim") => Promise<void>;
  handleUnlinkCase: () => Promise<void>;
  updateClaimStatus: (status: "approved" | "rejected" | "paid" | "under_review") => Promise<void>;
  setReviewRequestOpen: (open: boolean) => void;
}

export function SupportDetailsSidebar({
  selected,
  role,
  isInternal,
  matchedRequest,
  matchedClaim,
  authRequests,
  claims,
  rightCollapsed,
  setRightCollapsed,
  setMobileSubView,
  mobileSubView,
  handleLinkCase,
  handleUnlinkCase,
  updateClaimStatus,
  setReviewRequestOpen,
}: SupportDetailsSidebarProps) {
  const [linkSearchTerm, setLinkSearchTerm] = useState("");
  const [activeLinkType, setActiveLinkType] = useState<"request" | "claim">("request");

  const filteredRequestsForLinking = useMemo(() => {
    return authRequests.filter(
      (r) =>
        ["approved", "rejected"].includes(String(r.status || "").toLowerCase()) &&
        `${r.patient_name || ""} ${r.diagnosis || ""} ${r.treatment || ""} ${
          r.authorization_code || ""
        }`
          .toLowerCase()
          .includes(linkSearchTerm.toLowerCase())
    );
  }, [authRequests, linkSearchTerm]);

  const filteredClaimsForLinking = useMemo(() => {
    return claims.filter(
      (c) =>
        `${c.patient_name || ""} ${c.diagnosis || ""} ${c.claim_number || ""} ${c.auth_code || ""}`
          .toLowerCase()
          .includes(linkSearchTerm.toLowerCase())
    );
  }, [claims, linkSearchTerm]);

  return (
    <div
      className={cn(
        "w-full lg:w-[340px] border-l border-slate-200/80 bg-white h-full flex flex-col overflow-y-auto shrink-0 transition-all duration-300",
        mobileSubView === "INFO" ? "flex" : "hidden lg:flex",
        rightCollapsed ? "lg:w-0 lg:overflow-hidden lg:border-l-0 lg:hidden" : "lg:w-[340px]"
      )}
    >
      {/* Header with mobile back handle */}
      <div className="p-3 border-b border-slate-150 flex items-center justify-between bg-white shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Dispute Details
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8 rounded-lg text-slate-500"
            onClick={() => setMobileSubView("CHAT")}
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex h-8 w-8 rounded-xl text-slate-400 hover:text-slate-600 shrink-0"
            onClick={() => setRightCollapsed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Dynamic linked content rendering */}
      <div className="p-3 flex-1 space-y-3">
        {selected ? (
          <>
            {/* Case Reference or Claim Connected */}
            {matchedRequest ? (
              <div className="space-y-3 animate-in fade-in duration-300">
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                      Linked Authorization Details
                    </span>
                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 font-black text-xs px-1.5 uppercase rounded-lg">
                      {matchedRequest.request_id || matchedRequest.authorization_code || "REQ-LINKED"}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-1.5 text-xs leading-none">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Request Reference
                      </span>
                      <span className="font-mono font-black text-slate-900 text-xs leading-none">
                        {matchedRequest.request_id || matchedRequest.authorization_code || "REQ-LINKED"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Decision Status
                      </span>
                      <span className="font-black text-slate-800 text-xs uppercase">
                        {matchedRequest.status || "PENDING"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Authorization Code
                      </span>
                      <span className="font-mono font-black text-slate-900 text-xs leading-none">
                        {matchedRequest.status === "approved"
                          ? matchedRequest.authorization_code || "PENDING"
                          : "NONE"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Decision Note
                      </span>
                      <span className="font-bold text-slate-600 leading-tight">
                        {getDecisionReason(matchedRequest) || "No decision note recorded"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Patient Name
                      </span>
                      <span className="font-extrabold text-slate-800 text-xs leading-none">
                        {matchedRequest.patient_name}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Policy Number
                      </span>
                      <span className="font-mono font-black text-slate-900 text-xs leading-none">
                        {matchedRequest.policy_number}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Hospital
                      </span>
                      <span className="font-black text-slate-800 text-xs leading-none">
                        {matchedRequest.hospital_name || "Requesting hospital"}
                      </span>
                    </div>
                    {matchedRequest.requesting_hospital_name && (
                      <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Requesting Hospital
                        </span>
                        <span className="font-black text-slate-800 text-xs leading-none">
                          {matchedRequest.requesting_hospital_name}
                        </span>
                      </div>
                    )}
                    {matchedRequest.referring_hospital_name &&
                      matchedRequest.referring_hospital_name !== matchedRequest.hospital_name && (
                        <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                            Referring Hospital
                          </span>
                          <span className="font-black text-slate-800 text-xs leading-none">
                            {matchedRequest.referring_hospital_name}
                          </span>
                        </div>
                      )}
                    {matchedRequest.referred_hospital_name && (
                      <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Referred / Claim Owner
                        </span>
                        <span className="font-black text-slate-800 text-xs leading-none">
                          {matchedRequest.referred_hospital_name || matchedRequest.claiming_hospital_name}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Clinical Diagnosis
                      </span>
                      <span className="font-extrabold text-slate-700 leading-tight">
                        {matchedRequest.diagnosis}
                      </span>
                    </div>
                    {matchedRequest.treatment && (
                      <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Proposed Treatment
                        </span>
                        <span className="font-bold text-slate-600 leading-tight">
                          {matchedRequest.treatment}
                        </span>
                      </div>
                    )}
                    {matchedRequest.clinical_notes && (
                      <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Clinical Notes
                        </span>
                        <span className="font-bold text-slate-600 leading-tight">
                          {matchedRequest.clinical_notes}
                        </span>
                      </div>
                    )}
                    {matchedRequest.estimated_cost && (
                      <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded-lg border border-slate-100 mt-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                          Tariff Value
                        </span>
                        <span className="font-black text-slate-900 text-xs leading-none">
                          ₦{Number(matchedRequest.estimated_cost).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {isInternal && (
                      <div className="flex flex-col gap-1.5 mt-2">
                        <Button
                          onClick={() => setReviewRequestOpen(true)}
                          className="w-full h-8 rounded-lg bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white font-black uppercase tracking-wider text-xs transition-all shadow-md shadow-slate-900/20 ring-1 ring-white/10 inset active:scale-[0.98]"
                        >
                          Open Review Modal
                        </Button>
                        <Button
                          onClick={handleUnlinkCase}
                          variant="outline"
                          className="w-full h-8 rounded-lg text-rose-600 border-rose-200 bg-rose-50/30 hover:bg-rose-50 hover:border-rose-300 font-black uppercase tracking-wider text-xs transition-all active:scale-[0.98]"
                        >
                          Unlink Case
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : matchedClaim ? (
              <div className="space-y-3 animate-in fade-in duration-300">
                {/* Linked Claim Details */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                      Linked Claim Details
                    </span>
                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 font-black text-xs px-1.5 uppercase rounded-lg">
                      {matchedClaim.claim_number || "CLM-LINKED"}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-1.5 text-xs leading-none">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Patient Name
                      </span>
                      <span className="font-extrabold text-slate-800 text-xs leading-none">
                        {matchedClaim.patient_name}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        Authorization Code
                      </span>
                      <span className="font-mono font-black text-slate-900 text-xs leading-none">
                        {matchedClaim.auth_code || "PENDING"}
                      </span>
                    </div>
                    {matchedClaim.total_amount && (
                      <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded-lg border border-slate-100 mt-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                          Claim Amount
                        </span>
                        <span className="font-black text-slate-900 text-xs leading-none">
                          ₦{Number(matchedClaim.total_amount).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Verification actions */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                      Finance & Reimbursement
                    </span>
                    <Badge
                      className={cn(
                        "rounded-lg text-xs font-black uppercase px-2 py-0.5 border",
                        matchedClaim.status === "approved"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : matchedClaim.status === "paid"
                          ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                          : matchedClaim.status === "rejected"
                          ? "bg-rose-50 text-rose-700 border-rose-100"
                          : "bg-amber-50 text-amber-700 border-amber-100"
                      )}
                    >
                      {(matchedClaim.status || "").toUpperCase()}
                    </Badge>
                  </div>

                  {(role === "claims" || role === "admin") && (
                    <div className="flex flex-col gap-1.5">
                      <Button
                        onClick={() => updateClaimStatus("approved")}
                        className="w-full h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-wider text-xs transition-all"
                      >
                        Verify Tariffs
                      </Button>
                      <Button
                        onClick={() => updateClaimStatus("paid")}
                        className="w-full h-8 rounded-lg bg-indigo-900 hover:bg-indigo-800 text-white font-black uppercase tracking-wider text-xs transition-all"
                      >
                        Disburse Payment
                      </Button>
                    </div>
                  )}

                  {isInternal && (
                    <Button
                      onClick={handleUnlinkCase}
                      variant="outline"
                      className="w-full h-8 rounded-lg text-rose-600 border-rose-250 hover:bg-rose-50 font-black uppercase tracking-wider text-xs transition-all mt-2"
                    >
                      Unlink Case
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              /* Link Case Reference Selector */
              <div className="space-y-3 animate-in fade-in duration-300">
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/60 rounded-xl select-none">
                  <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 shrink-0 shadow-inner">
                    <Link2 className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800 uppercase tracking-tight">
                      No Active Case Linked
                    </p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mt-0.5 leading-normal">
                      Select a medical reference below to connect.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl text-xs font-black uppercase">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLinkType("request");
                      setLinkSearchTerm("");
                    }}
                    className={cn(
                      "py-1.5 rounded-lg transition-all",
                      activeLinkType === "request" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Auth Request
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLinkType("claim");
                      setLinkSearchTerm("");
                    }}
                    className={cn(
                      "py-1.5 rounded-lg transition-all",
                      activeLinkType === "claim" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Hospital Claim
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      value={linkSearchTerm}
                      onChange={(e) => setLinkSearchTerm(e.target.value)}
                      placeholder={
                        activeLinkType === "request"
                          ? "Search patient, diagnosis..."
                          : "Search patient, claim number..."
                      }
                      className="pl-8 h-8 rounded-lg bg-slate-50 border-none text-xs font-bold text-slate-700 placeholder-slate-400"
                    />
                  </div>

                  <div className="max-h-[220px] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl bg-white">
                    {activeLinkType === "request" ? (
                      filteredRequestsForLinking.length === 0 ? (
                        <div className="text-xs font-black uppercase text-slate-400 text-center py-4">
                          No matching requests
                        </div>
                      ) : (
                        filteredRequestsForLinking.map((req) => (
                          <button
                            key={req.id}
                            type="button"
                            onClick={() => handleLinkCase(req.id, "request")}
                            className="w-full p-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50/70 block transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-slate-500 truncate max-w-[80px]">
                                {req.authorization_code || "PENDING"}
                              </span>
                              <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-1 rounded uppercase">
                                {req.status}
                              </span>
                            </div>
                            <div className="text-xs font-black text-slate-900 truncate mt-1">
                              {req.patient_name}
                            </div>
                            <div className="text-slate-400 truncate mt-0.5">{req.diagnosis}</div>
                          </button>
                        ))
                      )
                    ) : filteredClaimsForLinking.length === 0 ? (
                      <div className="text-xs font-black uppercase text-slate-400 text-center py-4">
                        No matching claims
                      </div>
                    ) : (
                      filteredClaimsForLinking.map((clm) => (
                        <button
                          key={clm.id}
                          type="button"
                          onClick={() => handleLinkCase(clm.id, "claim")}
                          className="w-full p-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50/70 block transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-slate-500 truncate max-w-[80px]">
                              {clm.claim_number}
                            </span>
                            <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-1 rounded uppercase">
                              {clm.status}
                            </span>
                          </div>
                          <div className="text-xs font-black text-slate-900 truncate mt-1">
                            {clm.patient_name}
                          </div>
                          <div className="text-slate-400 truncate mt-0.5">{clm.auth_code}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center text-slate-400 text-xs py-12 select-none">
            No active medical reference context loaded.
          </div>
        )}
      </div>
    </div>
  );
}
