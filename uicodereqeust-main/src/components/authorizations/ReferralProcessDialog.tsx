import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, AlertOctagon } from "lucide-react";

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
      toast({ variant: "destructive", title: "OTP Required", description: "Please enter the 6-digit patient arrival OTP." });
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
      if (!result.verified) {
        throw new Error(result.error || "OTP verification failed");
      }

      // 2. Atomic update to referral_accepted status
      const { error: updateError } = await supabase
        .from("authorization_requests")
        .update({
          status: "referral_accepted"
        } as any)
        .eq("id", request.id);

      if (updateError) throw updateError;

      // 3. Log audit trail
      await supabase.from("authorization_logs").insert({
        request_id: request.id,
        action: "REFERRAL_ACCEPTED",
        performed_by: hospital.user_id,
        details: {
          hospital_id: hospital.id,
          hospital_name: hospital.name,
          timestamp: new Date().toISOString()
        }
      });

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
          decision_reason: finalReason
        } as any)
        .eq("id", request.id);

      if (updateError) throw updateError;

      // Log audit
      await supabase.from("authorization_logs").insert({
        request_id: request.id,
        action: "REFERRAL_DECLINED",
        performed_by: hospital.user_id,
        details: {
          hospital_id: hospital.id,
          hospital_name: hospital.name,
          reason: finalReason,
          timestamp: new Date().toISOString()
        }
      });

      toast({ title: "Referral Declined", description: "This referral has been declined and permanently locked." });
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
      <DialogContent className="max-w-md rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
        <div className="bg-slate-900 p-6 text-white relative">
          <h2 className="text-sm font-black uppercase tracking-tight italic">
            Process <span className="text-blue-400">Referral</span>
          </h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
            Stage 3: Acceptance & Physical Arrival
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Read Only Referral Information Container */}
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
            <p className="text-xs font-black text-slate-400 uppercase">Referral Information (Read-Only)</p>
            <div>
              <Label className="text-xs text-slate-400">Patient Name</Label>
              <p className="text-xs font-black uppercase text-slate-900">{request.patient_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/50">
              <div>
                <Label className="text-xs text-slate-400">Diagnosis</Label>
                <p className="text-xs font-bold uppercase text-slate-700">{request.diagnosis || "N/A"}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Referring Hospital</Label>
                <p className="text-xs font-bold uppercase text-slate-700">{request.referring_hospital_name || "N/A"}</p>
              </div>
            </div>
            {request.clinical_notes && (
              <div className="pt-2 border-t border-slate-200/50">
                <Label className="text-xs text-slate-400">Clinical Notes</Label>
                <p className="text-xs text-slate-600 font-medium">{request.clinical_notes}</p>
              </div>
            )}
          </div>

          {!showDeclineForm ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-black text-slate-400 tracking-wider">
                  Patient Arrival OTP (Verification)
                </Label>
                <Input
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="h-11 rounded-xl text-center font-mono font-black text-lg focus:ring-primary/20"
                />
                <p className="text-xs font-medium text-slate-400 leading-snug">
                  Ask the patient/family for the OTP sent to their contact info upon initial referral.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={handleAccept}
                  disabled={isVerifying}
                  className="h-11 rounded-xl bg-emerald-600 text-white font-black uppercase text-xs tracking-wider hover:bg-emerald-700 transition-all shadow-md active:scale-98"
                >
                  {isVerifying ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Accept Referral
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowDeclineForm(true)}
                  className="h-10 text-xs font-black uppercase text-rose-600 hover:bg-rose-50"
                >
                  Decline Referral
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-right duration-250">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-black text-slate-400 tracking-wider">
                  Reason for Decline
                </Label>
                <select
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full h-11 px-3 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase font-black text-slate-400 tracking-wider">
                    Please Explain
                  </Label>
                  <Textarea
                    placeholder="Enter details..."
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    className="min-h-[70px] rounded-xl text-xs font-medium"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowDeclineForm(false)}
                  className="h-11 flex-1 rounded-xl text-xs font-black uppercase"
                >
                  Back
                </Button>
                <Button
                  onClick={handleDecline}
                  disabled={isDeclining}
                  className="h-11 flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-xs tracking-wider"
                >
                  {isDeclining ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <AlertOctagon className="h-4 w-4 mr-2" />
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
