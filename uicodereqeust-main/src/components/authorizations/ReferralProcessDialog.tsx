import { BrandSpinner } from "@/components/BrandSpinner";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertOctagon, UserCheck } from "lucide-react";

interface ReferralProcessDialogProps {
  open: boolean;
  onClose: () => void;
  request: any;
  hospital: any;
  onUpdated: () => void;
}

export default function ReferralProcessDialog({
  open,
  onClose,
  request,
  hospital,
  onUpdated
}: ReferralProcessDialogProps) {
  const { toast } = useToast();
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [otherText, setOtherText] = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState(false);

  if (!request) return null;

  const handleAccept = async () => {
    if (!otp.trim()) {
      toast({ variant: "destructive", title: "OTP Required", description: "Please enter the 6-digit patient arrival PIN." });
      return;
    }

    setIsVerifying(true);
    try {
      // 1. Verify OTP via public.verify_otp
      const { data: verifyData, error: verifyError } = await supabase.rpc("verify_otp" as any, {
        p_request_id: request.id,
        p_otp_plaintext: otp.trim(),
        p_otp_type: "ARRIVAL",
        p_hospital_id: hospital.id
      });

      if (verifyError) throw verifyError;

      const result = verifyData as any;
      if (!result?.verified) {
        throw new Error(result?.error || "OTP verification failed");
      }

      // 2. Atomic update to referral_accepted status
      const { error: updateError } = await supabase
        .from("authorization_requests")
        .update({
          status: "referral_accepted"
        } as any)
        .eq("id", request.id);

      if (updateError) throw updateError;

      // 3. Log audit trail (asynchronous)
      supabase.from("authorization_logs").insert({
        request_id: request.id,
        action: "REFERRAL_ACCEPTED",
        performed_by: hospital.user_id,
        details: {
          hospital_id: hospital.id,
          hospital_name: hospital.name,
          timestamp: new Date().toISOString()
        }
      }).then(({ error }) => { if (error) console.error("Async log error:", error); });

      toast({ title: "Referral Accepted", description: "Referral successfully accepted. You can now submit the treatment plan." });
      onUpdated();
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Acceptance failed", description: err.message || "OTP verification failed." });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDecline = async () => {
    if (!declineReason) {
      toast({ variant: "destructive", title: "Decline Reason Required", description: "Please select a decline reason." });
      return;
    }
    const finalReason = declineReason === "Other" ? `Other: ${otherText}` : declineReason;
    if (declineReason === "Other" && !otherText.trim()) {
      toast({ variant: "destructive", title: "Explanation Required", description: "Please enter details for the decline." });
      return;
    }

    setIsDeclining(true);
    try {
      const { error: updateError } = await supabase
        .from("authorization_requests")
        .update({
          status: "referral_declined",
          decision_reason: finalReason,
          is_unlocked: false
        } as any)
        .eq("id", request.id);

      if (updateError) throw updateError;

      supabase.from("authorization_logs").insert({
        request_id: request.id,
        action: "REFERRAL_DECLINED",
        performed_by: hospital.user_id,
        details: {
          hospital_id: hospital.id,
          hospital_name: hospital.name,
          reason: finalReason,
          timestamp: new Date().toISOString()
        }
      }).then(({ error }) => { if (error) console.error("Async log error:", error); });

      toast({ title: "Referral Declined", description: "This referral has been declined." });
      onUpdated();
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Decline failed", description: err.message });
    } finally {
      setIsDeclining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
          <div className="pr-8">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-600" /> Accept Incoming Referral
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verify patient arrival PIN to take over treatment
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Read Only Referral Information */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-slate-500">Referral Details (Read-Only)</p>
            <div>
              <p className="text-xs font-bold text-slate-900">{request.patient_name}</p>
              <p className="text-[11px] font-mono text-slate-500">Policy: {request.policy_number || "—"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 block">Diagnosis</span>
                <span className="font-semibold text-slate-800">{request.diagnosis || "N/A"}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Referring Provider</span>
                <span className="font-semibold text-slate-800">{request.referring_hospital_name || "N/A"}</span>
              </div>
            </div>
            {request.clinical_notes && (
              <div className="pt-2 border-t border-slate-200/60">
                <span className="text-[11px] text-slate-500 block">Clinical Notes</span>
                <p className="text-xs text-slate-700 font-normal leading-relaxed mt-0.5">{request.clinical_notes}</p>
              </div>
            )}
          </div>

          {!showDeclineForm ? (
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="referral-otp-input" className="text-xs font-semibold text-slate-700">
                  Patient Arrival PIN (Verification)
                </Label>
                <Input
                  id="referral-otp-input"
                  maxLength={6}
                  placeholder="Enter 6-digit PIN"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.toUpperCase())}
                  className="h-10 rounded-lg text-center font-mono font-bold text-base border-slate-200 focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500 leading-snug">
                  Obtain the arrival PIN sent to the patient/enrollee upon referral creation.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <Button
                  onClick={handleAccept}
                  disabled={isVerifying}
                  className="h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  {isVerifying ? (
                    <BrandSpinner className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Accept Referral
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowDeclineForm(true)}
                  className="h-8 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                >
                  Decline Referral
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5 animate-in slide-in-from-right duration-200">
              <div className="space-y-1.5">
                <Label htmlFor="decline-reason-select" className="text-xs font-semibold text-slate-700">
                  Reason for Decline
                </Label>
                <select
                  id="decline-reason-select"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full h-9 px-3 bg-white rounded-lg border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-slate-400"
                >
                  <option value="">Select Reason...</option>
                  <option value="Specialist unavailable">Specialist unavailable</option>
                  <option value="Bed unavailable">Bed unavailable</option>
                  <option value="Equipment unavailable">Equipment unavailable</option>
                  <option value="Service not offered">Service not offered</option>
                  <option value="Patient unsuitable">Patient unsuitable</option>
                  <option value="Other">Other (requires explanation)</option>
                </select>
              </div>

              {declineReason === "Other" && (
                <div className="space-y-1">
                  <Label htmlFor="other-text-input" className="text-xs font-semibold text-slate-700">
                    Clinical Justification
                  </Label>
                  <Textarea
                    id="other-text-input"
                    placeholder="Provide detailed clinical explanation..."
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    className="min-h-[70px] rounded-lg text-xs border-slate-200"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDeclineForm(false)}
                  className="h-9 px-4 rounded-lg text-xs font-medium border-slate-200"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleDecline}
                  disabled={isDeclining}
                  className="h-9 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-sm"
                >
                  {isDeclining ? (
                    <BrandSpinner className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <AlertOctagon className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Confirm Decline
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
