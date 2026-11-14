import { BrandSpinner } from "@/components/BrandSpinner";
import { useState, useEffect } from "react";
import { safeIlikePattern } from "@/lib/postgrestFilter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, CheckCircle2, Search, Stethoscope, Plus, Minus } from "lucide-react";
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
  const [currentDiagnosis, setCurrentDiagnosis] = useState("");
  const [treatSearch, setTreatSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
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
        .or(`name.ilike.${safeIlikePattern(term)},code.ilike.${safeIlikePattern(term)},subcategory.ilike.${safeIlikePattern(term)}`)
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
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  };

  const handleQtyChange = (code: string, delta: number) => {
    const draft = quantityDrafts[code];
    const draftQuantity = Number(draft);
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
    setTreatments((prev) =>
      prev.map((t) => {
        if (t.code === code) {
          const baseQuantity = draft !== undefined && Number.isFinite(draftQuantity) && draftQuantity > 0
            ? Math.floor(draftQuantity)
            : t.quantity;
          const next = baseQuantity + delta;
          return { ...t, quantity: next > 0 ? next : 1 };
        }
        return t;
      })
    );
  };

  const handleQuantityDraftChange = (code: string, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, "");
    setQuantityDrafts((prev) => ({ ...prev, [code]: cleaned }));
  };

  const commitQuantityDraft = (code: string) => {
    const draft = quantityDrafts[code];
    if (draft === undefined) return;
    const quantity = Number(draft);
    if (draft !== "" && Number.isFinite(quantity) && quantity > 0) {
      setTreatments((prev) => prev.map((t) => t.code === code ? { ...t, quantity: Math.floor(quantity) } : t));
    }
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  };

  const total = treatments.reduce((sum, item) => sum + item.amount * item.quantity, 0);

  const handleSubmit = async () => {
    if (treatments.length === 0) {
      toast({ variant: "destructive", title: "Treatment Required", description: "Select at least one treatment item." });
      return;
    }

    setIsSubmitting(true);
    try {
      const treatmentText = treatments.map(t => `${t.name} (Qty: ${t.quantity}, Price: ₦${t.amount})`).join("; ");
      const approvedPayload = treatments.map((item) => ({
        code: item.code,
        name: item.name,
        category: item.category || item.subcategory || null,
        unit_price: Number(item.amount),
        quantity: Number(item.quantity),
        quantity_requires_review: false,
        price_requires_review: false,
        amount: Number(item.amount) * Number(item.quantity),
        frequency: null,
        duration: null,
        matched_via: "hospital-selected",
        matched_text: item.name,
        confidence: "high"
      }));

      const newDiagnosis = currentDiagnosis.trim() ? currentDiagnosis.trim() : request.diagnosis;

      // 1. Submit treatment items
      const { error: updateError } = await supabase
        .from("authorization_requests")
        .update({
          status: "pending_authorization",
          diagnosis: newDiagnosis,
          treatment: treatmentText,
          total_amount: total,
          approved_items: approvedPayload,
          is_unlocked: false,
          treatment_submitted_at: new Date().toISOString()
        } as any)
        .eq("id", request.id);

      if (updateError) throw updateError;

      // 2. Log audit event (asynchronous)
      supabase.from("authorization_logs").insert({
        request_id: request.id,
        action: "TREATMENT_SUBMITTED",
        performed_by: hospital.user_id,
        details: {
          hospital_id: hospital.id,
          hospital_name: hospital.name,
          total_amount: total,
          timestamp: new Date().toISOString()
        }
      }).then(({ error }) => { if (error) console.error("Async log error:", error); });

      toast({ title: "Treatment Submitted", description: "Treatment request submitted. Treatment PIN will be sent to the patient upon HMO approval." });
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
      <DialogContent className="max-w-xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl max-h-[92dvh] overflow-y-auto overflow-x-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
          <div className="pr-8">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-emerald-600" /> Referral Treatment Plan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Submit diagnosis and NHIA treatment tariff items for HMO authorization
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Referral Info (Read Only) */}
          <div className="p-3 rounded-lg bg-slate-50/70 border border-slate-200 space-y-2">
            <p className="text-[11px] font-semibold text-slate-500">Referral Overview (Read-Only)</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 block">Patient Name</span>
                <span className="font-bold text-slate-900">{request.patient_name}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Referral Code</span>
                <span className="font-mono font-bold text-slate-900">{request.authorization_code || "—"}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 block">Diagnosis</span>
                <span className="font-semibold text-slate-800">{request.diagnosis || "N/A"}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Referring Facility</span>
                <span className="font-semibold text-slate-800">{request.referring_hospital_name || "N/A"}</span>
              </div>
            </div>
          </div>

          {/* Treatment Request (Editable) */}
          <div className="space-y-3.5">
            <div className="space-y-1">
              <Label htmlFor="current-diagnosis-input" className="text-xs font-semibold text-slate-700">
                Updated Diagnosis (Optional)
              </Label>
              <Textarea
                id="current-diagnosis-input"
                placeholder="Enter current diagnosis here if modified upon clinical examination..."
                value={currentDiagnosis}
                onChange={(e) => setCurrentDiagnosis(e.target.value)}
                className="min-h-[55px] rounded-lg border-slate-200 text-xs bg-white"
              />
            </div>

            <div className="space-y-1 relative">
              <Label htmlFor="tariff-search-input" className="text-xs font-semibold text-slate-700">
                Search NHIA Tariff Database
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="tariff-search-input"
                  placeholder="Type drug, procedure, or consumable name..."
                  value={treatSearch}
                  onChange={(e) => setTreatSearch(e.target.value)}
                  className="pl-9 h-9 rounded-lg text-xs border-slate-200 bg-white"
                />
              </div>

              {/* Suggestions dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-[60px] bg-white border border-slate-200 rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                  {searchResults.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => handleAddItem(item)}
                      className="w-full text-left p-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{item.code} · {item.subcategory || item.category}</p>
                      </div>
                      <span className="font-semibold text-emerald-700 font-mono shrink-0">₦{Number(item.amount).toLocaleString("en-NG")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Treatment items */}
            <div className="space-y-2">
              {treatments.length === 0 ? (
                <div className="p-5 rounded-lg border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                  No treatments selected. Use the search bar above to add items from the NHIA tariff list.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {treatments.map((item) => (
                    <div key={item.code} className="flex items-center justify-between p-2.5 bg-slate-50/70 border border-slate-200 rounded-lg gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">₦{item.amount.toLocaleString("en-NG")} each</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Qty controls */}
                        <div className="flex items-center border border-slate-200 rounded-md bg-white">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(item.code, -1)}
                            className="h-6 w-6 flex items-center justify-center text-slate-500 hover:bg-slate-100"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            aria-label={`Quantity for ${item.name}`}
                            value={quantityDrafts[item.code] ?? String(item.quantity)}
                            onChange={(event) => handleQuantityDraftChange(item.code, event.target.value)}
                            onBlur={() => commitQuantityDraft(item.code)}
                            onFocus={(event) => event.target.select()}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                            }}
                            className="h-6 w-10 border-x border-slate-200 bg-transparent px-1 text-center text-xs font-semibold font-mono tabular-nums text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                          />
                          <button
                            type="button"
                            onClick={() => handleQtyChange(item.code, 1)}
                            className="h-6 w-6 flex items-center justify-center text-slate-500 hover:bg-slate-100"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="w-20 text-right font-mono font-semibold text-slate-900">
                          ₦{(item.amount * item.quantity).toLocaleString("en-NG")}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(item.code)}
                          className="h-7 w-7 text-rose-500 hover:bg-rose-50 rounded"
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Total summary */}
            {treatments.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-emerald-50/80 rounded-lg border border-emerald-200 text-emerald-900 text-xs">
                <span className="font-medium">Total Treatment Tariff Value</span>
                <span className="font-mono font-bold text-sm text-emerald-700">₦{total.toLocaleString("en-NG")}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-9 px-4 rounded-lg text-xs font-medium border-slate-200 text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || treatments.length === 0}
              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              {isSubmitting ? (
                <>
                  <BrandSpinner className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Submitting…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Submit Treatment Plan
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
