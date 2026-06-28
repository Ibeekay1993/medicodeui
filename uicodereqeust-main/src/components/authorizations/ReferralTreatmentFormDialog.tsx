import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Trash2, CheckCircle2, Search } from "lucide-react";
import { TreatmentItem } from "@/lib/new-request-helpers";

interface ReferralTreatmentFormDialogProps {
  open: boolean;
  onClose: () => void;
  request: any;
  hospital: any;
  onUpdated: () => void;
}

export default function ReferralTreatmentFormDialog({
  open,
  onClose,
  request,
  hospital,
  onUpdated
}: ReferralTreatmentFormDialogProps) {
  const { toast } = useToast();
  const [treatments, setTreatments] = useState<TreatmentItem[]>([]);
  const [treatSearch, setTreatSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [_searchLoading, setSearchLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search NHIA Items
  useEffect(() => {
    const term = treatSearch.trim();
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("nhia_items" as any)
        .select("code,name,amount,category,subcategory")
        .or(`name.ilike.%${term}%,code.ilike.%${term}%,subcategory.ilike.%${term}%`)
        .eq("is_active", true)
        .limit(10);
      setSearchResults(data || []);
      setSearchLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [treatSearch]);

  if (!request) return null;

  const handleAddItem = (item: any) => {
    const exists = treatments.find((t) => t.code === item.code);
    if (exists) {
      toast({ title: "Item already added", description: "Increase the quantity instead." });
      return;
    }
    setTreatments((prev) => [
      ...prev,
      {
        code: item.code,
        name: item.name,
        amount: Number(item.amount),
        category: item.category,
        subcategory: item.subcategory,
        quantity: 1
      }
    ]);
    setTreatSearch("");
    setSearchResults([]);
  };

  const handleRemoveItem = (code: string) => {
    setTreatments((prev) => prev.filter((t) => t.code !== code));
  };

  const handleQtyChange = (code: string, delta: number) => {
    setTreatments((prev) =>
      prev.map((t) => {
        if (t.code === code) {
          const next = t.quantity + delta;
          return { ...t, quantity: next > 0 ? next : 1 };
        }
        return t;
      })
    );
  };

  const total = treatments.reduce((sum, item) => sum + item.amount * item.quantity, 0);

  const handleSubmit = async () => {
    if (treatments.length === 0) {
      toast({ variant: "destructive", title: "Treatment Required", description: "Select at least one treatment item." });
      return;
    }

    setIsSubmitting(true);
    try {
      const treatmentText = treatments
        .map((t) => `${t.name} [Code: ${t.code}] (Qty: ${t.quantity} x ₦${t.amount} = ₦${t.quantity * t.amount})`)
        .join("; ");

      const approvedPayload = treatments.map((item) => ({
        code: item.code,
        name: item.name,
        category: item.category || item.subcategory || null,
        unit_price: Number(item.amount),
        quantity: Number(item.quantity),
        amount: Number(item.amount) * Number(item.quantity),
        frequency: null,
        duration: null,
        matched_via: "hospital-selected",
        matched_text: item.name,
        confidence: "high"
      }));

      // 1. Submit Treatment request - set status to pending_authorization
      const { error: updateError } = await supabase
        .from("authorization_requests")
        .update({
          status: "pending_authorization",
          treatment: treatmentText,
          total_amount: total,
          approved_items: approvedPayload,
          is_unlocked: false
        } as any)
        .eq("id", request.id);

      if (updateError) throw updateError;

      // 2. Log audit event
      await supabase.from("authorization_logs").insert({
        request_id: request.id,
        action: "TREATMENT_SUBMITTED",
        performed_by: hospital.user_id,
        details: {
          hospital_id: hospital.id,
          hospital_name: hospital.name,
          total_amount: total,
          timestamp: new Date().toISOString()
        }
      });

      // 3. Send NEW OTP (Type: TREATMENT)
      await supabase.functions.invoke("send-otp", {
        method: "POST",
        body: {
          authorization_id: request.id,
          patient_email: request.patient_email || "no-email@medicode.com",
          policy_number: request.policy_number,
          otp_type: "TREATMENT",
          hospital_id: hospital.id
        }
      });

      toast({ title: "Treatment Submitted", description: "Treatment request submitted. Treatment Consent OTP has been sent to the patient." });
      onUpdated();
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Submission failed", description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl rounded-2xl border-none shadow-2xl p-0 max-h-[92dvh] overflow-y-auto overflow-x-hidden">
        <div className="bg-[#3f3f95] p-6 text-white relative">
          <h2 className="text-sm font-black uppercase tracking-tight italic">
            Treatment <span className="text-emerald-400">Request Form</span>
          </h2>
          <p className="text-xs font-bold text-slate-200/80 uppercase tracking-widest mt-1">
            Stage 4: Referral Case Details
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* SECTION A: Referral Info (Read Only) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">SECTION A: Referral Information (Read-Only)</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-slate-400">Patient Name</Label>
                <p className="text-xs font-black uppercase text-slate-800">{request.patient_name}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Referral Code</Label>
                <p className="text-xs font-mono font-black text-slate-800">{request.authorization_code}</p>
              </div>
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
          </div>

          {/* SECTION B: Treatment Request (Editable) */}
          <div className="space-y-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">SECTION B: Treatment Items (Editable)</p>

            <div className="space-y-2 relative">
              <Label className="text-xs uppercase font-black text-slate-400 tracking-wider">Search NHIA Tariff Database</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Type drug, procedure, or consumable..."
                  value={treatSearch}
                  onChange={(e) => setTreatSearch(e.target.value)}
                  className="pl-9 h-10 rounded-xl focus:ring-primary/20 bg-white"
                />
              </div>

              {/* Suggestions dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute z-55 left-0 right-0 top-18 bg-white border border-slate-200 rounded-xl shadow-xl max-h-[220px] overflow-y-auto">
                  {searchResults.map((item) => (
                    <button
                      key={item.code}
                      onClick={() => handleAddItem(item)}
                      className="w-full text-left p-3 hover:bg-slate-50 transition-colors border-b border-slate-100 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-black text-slate-900 uppercase">{item.name}</p>
                        <p className="text-xs font-bold text-slate-400 tracking-wide font-mono mt-0.5">{item.code} - {item.subcategory || item.category}</p>
                      </div>
                      <span className="font-black text-emerald-600 font-mono">₦{Number(item.amount).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Treatment items */}
            <div className="space-y-2">
              {treatments.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs font-semibold">
                  No treatments selected. Use the search bar above to select items.
                </div>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {treatments.map((item) => (
                    <div key={item.code} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-xs gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-slate-800 uppercase truncate">{item.name}</p>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">₦{item.amount.toLocaleString()} each</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Qty selectors */}
                        <div className="flex items-center border border-slate-200 rounded-lg">
                          <button onClick={() => handleQtyChange(item.code, -1)} className="px-2 py-1 text-slate-500 hover:bg-slate-100 font-bold">-</button>
                          <span className="px-2 text-xs font-black font-mono">{item.quantity}</span>
                          <button onClick={() => handleQtyChange(item.code, 1)} className="px-2 py-1 text-slate-500 hover:bg-slate-100 font-bold">+</button>
                        </div>
                        <span className="w-16 text-right text-xs font-black font-mono text-slate-800">
                          ₦{(item.amount * item.quantity).toLocaleString()}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(item.code)}
                          className="h-8 w-8 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Total summary */}
            {treatments.length > 0 && (
              <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-800 font-black">
                <span className="text-xs uppercase tracking-wider">Total Request Amount</span>
                <span className="font-mono text-sm">₦{total.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="h-11 flex-1 rounded-xl text-xs font-black uppercase"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || treatments.length === 0}
              className="h-11 flex-1 rounded-xl bg-[#3f3f95] hover:bg-[#32327a] text-white font-black uppercase text-xs tracking-wider shadow-lg shadow-[#3f3f95]/15"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Submit Request
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
