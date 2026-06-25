import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl border-slate-200 p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-slate-100 bg-slate-50/70">
          <DialogTitle className="text-sm font-black uppercase tracking-tight text-slate-900">
            Contest Audit Decision
          </DialogTitle>
          <DialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
            Explain the clinical reason for contesting the declined or adjusted item. Fully approved claims do not need
            a contest.
          </DialogDescription>
        </DialogHeader>
        <div className="p-5 space-y-3">
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
            <p className="text-xs font-black uppercase tracking-widest text-rose-500">Claim Reference</p>
            <p className="mt-1 font-mono text-xs font-black text-slate-900">{contestTarget?.claim_number}</p>
            <p className="mt-2 text-xs font-black uppercase text-rose-700 font-sans">
              Amount under contest: ₦{contestedAmount.toLocaleString()}
            </p>
          </div>
          
          <div className="space-y-1">
            <Textarea
              {...register("contestReason")}
              placeholder="Enter clinical justification and supporting details (min 20 chars)..."
              className={`min-h-[130px] resize-none rounded-xl border-slate-200 bg-white text-xs font-medium leading-relaxed ${errors.contestReason ? "border-red-500 focus-visible:ring-red-500" : ""}`}
            />
            {errors.contestReason && (
              <p className="text-[10px] font-bold text-red-500">{errors.contestReason.message}</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Supporting documents</p>
            <input
              type="file"
              multiple
              onChange={(e) => {
                if (e.target.files) {
                  setValue("contestFiles", Array.from(e.target.files));
                }
              }}
              className="mt-2 block w-full text-xs font-bold text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-black file:uppercase file:text-slate-700"
            />
            {files?.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {files.length} document(s) attached for audit review.
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/70 p-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={handleClose}
            className="h-9 rounded-xl text-xs font-black uppercase tracking-wider"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit(submitForm)}
            className="h-9 rounded-xl bg-rose-600 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-700"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit Contest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
