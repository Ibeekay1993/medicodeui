import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/claims-helpers";
import { Loader2 } from "lucide-react";
import { PaymentsService } from "../services/paymentsService";
import { useCreatePaymentBatch } from "../hooks/usePayments";

interface CreateBatchModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedClaims: any[];
  hospitalId: string;
  hospitalName: string;
  totalAmount: number;
  onSuccess: () => void;
}

export function CreateBatchModal({
  isOpen,
  onOpenChange,
  selectedClaims,
  hospitalId,
  hospitalName,
  totalAmount,
  onSuccess,
}: CreateBatchModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [batchRef, setBatchRef] = useState("");
  const createBatchMutation = useCreatePaymentBatch();
  const isSubmitting = createBatchMutation.isPending;

  const date = new Date();
  const monthName = date.toLocaleString("default", { month: "short" }).toUpperCase();
  const monthCode = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  // Pre-generate the batch reference for visibility in the modal
  useEffect(() => {
    if (!isOpen) return;

    const generateRef = async () => {
      try {
        const ref = await PaymentsService.generateBatchReference();
        setBatchRef(ref);
      } catch (err) {
        console.error("Failed to generate batch reference via RPC, falling back to client-side:", err);
        setBatchRef(`PAY-${monthName}-${Math.floor(100 + Math.random() * 900)}`);
      }
    };

    generateRef();
  }, [isOpen, monthCode, monthName]);

  const handleCreateBatch = async () => {
    if (!user || !batchRef) return;

    try {
      // Call atomic database RPC function to create batch and link claims in one transaction
      await createBatchMutation.mutateAsync({
        batchRef,
        hospitalId,
        monthCode,
        totalClaims: selectedClaims.length,
        totalAmount,
        userId: user.id,
        claimIds: selectedClaims.map((c) => c.id),
      });

      toast({
        title: "Batch Created Successfully",
        description: `Batch ${batchRef} containing ${selectedClaims.length} claim(s) has been assembled.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      // Map common database constraint errors to user-friendly messages
      let errorMsg = error.message;
      if (errorMsg?.includes("payment_batches_batch_reference_key")) {
        errorMsg = "A batch with this reference code already exists.";
      }
      toast({
        variant: "destructive",
        title: "Batch Creation Failed",
        description: errorMsg || "An unexpected error occurred during batching.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl bg-white border border-slate-100 p-6 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-black uppercase tracking-wider text-slate-900">
            Create Payment Batch
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-400">PROVIDER:</span>
              <span className="font-black text-slate-800">{hospitalName}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-400">SETTLEMENT MONTH:</span>
              <span className="font-black text-slate-800">{monthName} {date.getFullYear()}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-400">CLAIMS SELECTED:</span>
              <span className="font-black text-[#3f3f95]">{selectedClaims.length} Claim(s)</span>
            </div>
            <div className="border-t border-slate-200 my-2 pt-2 flex justify-between items-center text-xs">
              <span className="font-black text-slate-900 uppercase">Total Amount:</span>
              <span className="font-mono font-black text-lg text-emerald-600">
                {money(totalAmount)}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400 block">
              Batch Reference Code (Auto-Generated)
            </label>
            <div className="border border-slate-200 bg-slate-50 font-mono font-black text-xs text-slate-700 px-3 py-2 rounded-lg text-center tracking-wider">
              {batchRef || "Generating Reference..."}
            </div>
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2 mt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="text-xs font-black uppercase tracking-wider text-slate-400 hover:text-slate-600 h-9 rounded-lg"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCreateBatch}
            disabled={isSubmitting || !batchRef}
            className="bg-[#3f3f95] hover:bg-[#34347d] text-white font-black uppercase text-xs tracking-wider h-9 px-5 rounded-lg transition-all shadow-sm shadow-[#3f3f95]/10"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Assembling...
              </span>
            ) : (
              "Confirm & Create Batch"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
