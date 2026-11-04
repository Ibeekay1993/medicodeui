import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle
} from "@/components/ui/dialog";
import { Loader2, AlertTriangle } from "lucide-react";
import { ClaimDraft } from "@/lib/claims-helpers";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const contestSchema = z.object({
  contestReason: z.string().min(20, "Please provide a detailed clinical justification (at least 20 characters)"),
  contestFiles: z.any()
});

export type ContestFormData = z.infer<typeof contestSchema>;

interface ContestDecisionDialogProps {
  contestTarget: ClaimDraft | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ContestFormData) => Promise<void>;
  contestedAmount: number;
}

export default function ContestDecisionDialog({
  contestTarget,
  isOpen,
  onOpenChange,
  onSubmit,
  contestedAmount
}: ContestDecisionDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ContestFormData>({
    resolver: zodResolver(contestSchema),
    defaultValues: {
      contestReason: "",
      contestFiles: []
    }
  });

  const files = watch("contestFiles") as File[];

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const submitForm = async (data: ContestFormData) => {
    await onSubmit(data);
    reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
          <div className="pr-8">
            <DialogTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Contest Audit Decision
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Submit clinical justification for disputed deduction or rejection
            </DialogDescription>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-3.5">
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
            <span className="text-[11px] font-semibold text-rose-700 block">Claim Reference</span>
            <p className="mt-0.5 font-mono text-xs font-bold text-slate-900">{contestTarget?.claim_number}</p>
            <p className="mt-1 text-xs font-semibold text-rose-800">
              Amount under dispute: ₦{contestedAmount.toLocaleString("en-NG")}
            </p>
          </div>
          
          <div className="space-y-1">
            <label htmlFor="contest-reason-field" className="text-xs font-semibold text-slate-700 block">
              Clinical Justification <span className="text-rose-500">*</span>
            </label>
            <Textarea
              id="contest-reason-field"
              {...register("contestReason")}
              placeholder="Provide medical indication, dosage rationale, or emergency context (min 20 characters)..."
              className={`min-h-[110px] resize-none rounded-lg border-slate-200 bg-white text-xs leading-relaxed ${errors.contestReason ? "border-red-500 focus-visible:ring-red-500" : ""}`}
            />
            {errors.contestReason && (
              <p className="text-[11px] font-medium text-red-500">{errors.contestReason.message}</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-700 block">Supporting Documents (Optional)</span>
            <input
              type="file"
              multiple
              onChange={(e) => {
                if (e.target.files) {
                  setValue("contestFiles", Array.from(e.target.files));
                }
              }}
              className="mt-1 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 file:border file:border-slate-200"
            />
            {files?.length > 0 && (
              <p className="mt-1 text-xs font-medium text-slate-600">
                {files.length} document(s) selected for audit panel.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={handleClose}
            className="h-9 px-4 rounded-lg text-xs font-medium border-slate-200 text-slate-700"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit(submitForm)}
            className="h-9 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Submitting…
              </>
            ) : (
              "Submit Contest"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
