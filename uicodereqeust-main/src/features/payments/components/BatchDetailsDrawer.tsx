import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/claims-helpers";
import { Loader2, FileSpreadsheet, Calendar, User, Hash } from "lucide-react";
import { useBatchDetails, useBatchClaims } from "../hooks/usePayments";

interface BatchDetailsDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
}

export function BatchDetailsDrawer({
  isOpen,
  onOpenChange,
  batchId,
}: BatchDetailsDrawerProps) {
  // 1. Fetch batch details
  const { data: batch, isLoading: isLoadingBatch } = useBatchDetails(batchId);

  // 2. Fetch claims linked to this batch (excluding clinical diagnoses/notes for HIPAA)
  const { data: claims, isLoading: isLoadingClaims } = useBatchClaims(batchId);

  const loading = isLoadingBatch || isLoadingClaims;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg bg-white border-l border-slate-100 p-0 shadow-2xl flex flex-col h-full">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm font-black uppercase tracking-wider text-slate-900">
                Batch Reconciliation Details
              </SheetTitle>
              {batch && (
                <Badge className={`text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                  batch.status === "paid"
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                    : batch.status === "ready"
                    ? "bg-slate-100 text-slate-600 border border-slate-200"
                    : "bg-slate-100 text-slate-500 border border-slate-200"
                }`}>
                  {batch.status}
                </Badge>
              )}
            </div>
          </SheetHeader>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading batch details...</p>
          </div>
        ) : batch ? (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Header statistics info */}
            <div className="p-5 bg-slate-50/50 border-b border-slate-100 space-y-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Provider</p>
                <p className="text-sm font-black text-slate-950 mt-0.5">{batch.hospitals?.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">Batch Reference</p>
                  <p className="font-mono font-black text-slate-800 text-xs mt-0.5 flex items-center gap-1">
                    <Hash className="h-3 w-3 text-slate-400" /> {batch.batch_reference}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">Claims Count</p>
                  <p className="font-mono font-black text-[#3f3f95] text-xs mt-0.5">
                    {batch.total_claims} Claim(s)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">Settlement Month</p>
                  <p className="font-semibold text-slate-800 text-xs mt-0.5 flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-400" /> {batch.month}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">Total Value</p>
                  <p className="font-mono font-black text-emerald-600 text-sm mt-0.5">
                    {money(batch.total_amount)}
                  </p>
                </div>
              </div>

              {/* Settlement Info */}
              {batch.status === "paid" && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/[0.15] p-3 space-y-1.5 animate-in fade-in duration-300">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span className="text-xs font-black text-emerald-700 uppercase tracking-wide">
                      Paid Transaction Audit Log
                    </span>
                  </div>
                  <div className="text-xs space-y-1 font-medium text-slate-600">
                    <p>Bank Reference: <span className="font-mono font-black text-slate-800">{batch.bank_reference || "N/A"}</span></p>
                    <p>Settled On: <span className="font-bold text-slate-800">{new Date(batch.paid_at).toLocaleString("en-GB")}</span></p>
                    {batch.receipt_url && (
                      <div className="pt-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const { data, error } = await supabase.storage
                              .from("payment-receipts")
                              .createSignedUrl(batch.receipt_url, 3600);
                            if (error) {
                              alert("Error fetching receipt: " + error.message);
                            } else if (data?.signedUrl) {
                              window.open(data.signedUrl, "_blank");
                            }
                          }}
                          className="flex items-center gap-1 text-xs font-black uppercase text-[#3f3f95] hover:text-[#34347d] border border-slate-200 bg-white rounded px-2 py-1 transition-all cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-[#3f3f95]" />
                          View Payment Proof ({batch.receipt_name || "File"})
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Claims Table list */}
            <div className="p-5 space-y-3 flex-1 flex flex-col">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 shrink-0">
                Linked Claims Ledger ({claims?.length || 0})
              </h4>
              <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                {claims?.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors shadow-sm gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-black text-xs text-slate-400 tracking-tight leading-none">
                        {claim.claim_number}
                      </p>
                      <p className="text-xs font-black text-slate-800 leading-tight uppercase mt-1 truncate">
                        {claim.patient_name}
                      </p>
                      <p className="text-xs font-bold text-slate-500 mt-0.5 truncate">
                        ID: {claim.policy_number}
                      </p>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                      <Badge className={`border text-xs font-black uppercase px-2 py-0.5 rounded-full ${
                        claim.status === "paid"
                          ? "bg-emerald-500/10 text-emerald-600 border-none"
                          : "bg-slate-100 text-slate-600 border-none"
                      }`}>
                        {claim.status}
                      </Badge>
                      <span className="font-mono font-black text-slate-900 text-xs">
                        {money(claim.approved_amount || claim.total_amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
            Batch records not found.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
