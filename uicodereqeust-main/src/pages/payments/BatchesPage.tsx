import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/claims-helpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  FolderOpen,
  Download,
  CheckCircle,
  CreditCard,
} from "lucide-react";
import { BatchDetailsDrawer } from "./BatchDetailsDrawer";
import { MonthYearPicker } from "@/components/ui/MonthYearPicker";

interface Batch {
  id: string;
  batch_reference: string;
  provider_id: string;
  month: string;
  total_claims: number;
  total_amount: number;
  status: "draft" | "ready" | "paid";
  bank_reference: string | null;
  created_at: string;
  created_by: string | null;
  paid_at: string | null;
  receipt_url: string | null;
  receipt_name: string | null;
  hospitals: { name: string } | null;
}

export default function BatchesPage() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"all" | "draft" | "ready" | "paid">("all");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [payBatchTarget, setPayBatchTarget] = useState<Batch | null>(null);
  const [bankRef, setBankRef] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const isViewOnly = role === "claims"; // Claims Officers get view-only access
  const canModifyDrafts = role === "admin" || role === "finance"; // Admin and Finance can cancel or mark ready draft batches
  const canSettlePayments = role === "admin" || role === "finance"; // Admin and Finance can settle payments


// Fetch payment batches with hospital details joined
   const { data: batches, isLoading, refetch, error } = useQuery({
     queryKey: ["payment-batches"],
     queryFn: async () => {
       const { data, error } = await (supabase as any)
         .from("payment_batches")
         .select(`
           *,
           hospitals:provider_id(name)
         `)
         .order("created_at", { ascending: false });

       if (error) throw error;
       return data as unknown as Batch[];
     }
   });

  // Filter batches by active tab status, search query, month, and date range
  const filteredBatches = useMemo(() => {
    if (!batches) return [];
    return batches.filter(b => {
      // 1. Status tab filter
      if (activeTab !== "all" && b.status !== activeTab) return false;

      // 2. Search term filter
      const matchesSearch = 
        b.batch_reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.hospitals?.name || "").toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // 3. Month filter
      if (selectedMonth && b.month !== selectedMonth) return false;

      // 4. Date range filter
      if (b.created_at) {
        const createdDateStr = b.created_at.substring(0, 10); // "YYYY-MM-DD"
        if (startDate && createdDateStr < startDate) return false;
        if (endDate && createdDateStr > endDate) return false;
      }

      return true;
    });
  }, [batches, activeTab, searchTerm, selectedMonth, startDate, endDate]);

  // Export batch claims to CSV
  const handleExportCSV = async (batch: Batch) => {
    try {
      const { data: claims, error } = await (supabase as any)
        .from("hospital_claims")
        .select("claim_number, patient_name, policy_number, hospital_name, approved_amount, total_amount, approved_at")
        .eq("payment_batch_id", batch.id);

      if (error) throw error;
      if (!claims || claims.length === 0) {
        toast({ title: "No Claims Found", description: "This batch contains no claims." });
        return;
      }

      const headers = ["Claim Number", "Patient Name", "Policy Number", "Provider", "Approved Amount", "Approved Date"];
      const rows = (claims as any[]).map((c: any) => [
        c.claim_number,
        c.patient_name,
        c.policy_number,
        c.hospital_name,
        c.approved_amount || c.total_amount,
        c.approved_at ? new Date(c.approved_at).toLocaleDateString("en-GB") : ""
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${batch.batch_reference}_Bank_Upload.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Export Complete", description: "CSV sheet generated for bank transfer system." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export Failed", description: err.message });
    }
  };

  // Mark a batch as paid
  const handleConfirmPayment = async () => {
    if (!payBatchTarget || !user) return;
    setIsSubmittingPayment(true);

    try {
      let receiptUrl: string | null = null;
      let receiptName: string | null = null;

      if (receiptFile) {
        const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${payBatchTarget.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("payment-receipts")
          .upload(storagePath, receiptFile, { upsert: false });

        if (uploadError) throw uploadError;

        receiptUrl = storagePath;
        receiptName = receiptFile.name;
      }

      // 1. Update batch status
      const { error: batchError } = await (supabase as any)
        .from("payment_batches")
        .update({
          status: "paid",
          bank_reference: bankRef.trim() || null,
          paid_by: user.id,
          paid_at: new Date().toISOString(),
          receipt_url: receiptUrl,
          receipt_name: receiptName
        })
        .eq("id", payBatchTarget.id);

      if (batchError) throw batchError;

      // 2. Automatically update all claims in this batch to paid
      const { error: claimsError } = await supabase
        .from("hospital_claims" as any)
        .update({
          status: "paid",
          payment_status: "paid",
          paid_by: user.id,
          paid_at: new Date().toISOString()
        })
        .eq("payment_batch_id", payBatchTarget.id);

      if (claimsError) throw claimsError;

      toast({
        title: "Batch Marked Paid",
        description: `Batch ${payBatchTarget.batch_reference} marked as settled.`
      });

      setPayBatchTarget(null);
      setBankRef("");
      setReceiptFile(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["awaiting-payment-claims"] });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Payment Submission Failed",
        description: err.message
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Cancel a draft batch: deletes the batch and resets its claims to awaiting_payment
  const handleCancelBatch = async (batch: Batch) => {
    if (!canModifyDrafts) return;
    if (!window.confirm(`Are you sure you want to cancel and delete batch ${batch.batch_reference}? This will release all associated claims back to Awaiting Payment.`)) {
      return;
    }
    
    try {
      // 1. Release claims back to awaiting_payment
      const { error: claimsError } = await supabase
        .from("hospital_claims" as any)
        .update({
          payment_batch_id: null,
          payment_status: "awaiting_payment"
        })
        .eq("payment_batch_id", batch.id);

      if (claimsError) throw claimsError;

      // 2. Delete the payment batch header
      const { error: batchError } = await (supabase as any)
        .from("payment_batches")
        .delete()
        .eq("id", batch.id);

      if (batchError) throw batchError;

      toast({
        title: "Batch Cancelled",
        description: `Batch ${batch.batch_reference} has been deleted and claims released.`
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["awaiting-payment-claims"] });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Cancellation Failed",
        description: err.message
      });
    }
  };

  // Move a batch from draft to ready
  const handleMarkReady = async (batch: Batch) => {
    if (!canModifyDrafts) return;
    try {
      const { error } = await (supabase as any)
        .from("payment_batches")
        .update({ status: "ready" })
        .eq("id", batch.id);

      if (error) throw error;

      toast({
        title: "Batch Ready",
        description: `Batch ${batch.batch_reference} is now marked as ready for settlement.`
      });
      refetch();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Status Update Failed",
        description: err.message
      });
    }
  };


  if (isLoading) {
    return (
      <div className="flex h-64 flex-col gap-3 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-800" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Batches Workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col gap-4 items-center justify-center bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <p className="text-xs font-black text-rose-600 uppercase tracking-wider">Failed to load batches</p>
        <p className="text-xs font-bold text-slate-400">{(error as any).message || "An unexpected network error occurred."}</p>
        <Button onClick={() => refetch()} className="bg-[#3f3f95] hover:bg-[#34347d] text-white font-black text-xs uppercase tracking-wider h-8 px-4 rounded-lg">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs / Filters Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex space-x-1.5 bg-slate-100 p-1 rounded-lg">
            {(["all", "draft", "ready", "paid"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === tab 
                    ? "bg-white text-slate-900 shadow-sm" 
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <input 
            type="text" 
            placeholder="Search batch ref or provider..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium w-full sm:w-48 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
          />

          <MonthYearPicker
            value={selectedMonth}
            onChange={(val) => {
              setSelectedMonth(val);
              setStartDate("");
              setEndDate("");
            }}
            className="w-full sm:w-44"
            id="batches-month-filter"
          />

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setSelectedMonth("");
              }}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
              placeholder="Start"
              title="Start Date"
            />
            <span className="text-xs text-slate-400 font-bold uppercase">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setSelectedMonth("");
              }}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
              placeholder="End"
              title="End Date"
            />
          </div>

          {(searchTerm || selectedMonth || startDate || endDate) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchTerm("");
                setSelectedMonth("");
                setStartDate("");
                setEndDate("");
              }}
              className="text-xs font-black text-rose-500 hover:text-rose-600 uppercase tracking-wider h-8 px-2.5 rounded-lg"
            >
              Clear
            </Button>
          )}
        </div>
        
        <div className="text-right shrink-0">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400">
            {filteredBatches.length} Batch(es) Found
          </span>
        </div>
      </div>

      {/* Batches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBatches.map(batch => {
          const hospName = batch.hospitals?.name || "Unknown Provider";
          const statusColors = {
            draft: "bg-slate-100 text-slate-500 border-slate-200",
            ready: "bg-blue-50 text-blue-600 border-blue-100",
            paid: "bg-emerald-50 text-emerald-600 border-emerald-100"
          };

          return (
            <Card key={batch.id} className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-4 flex-1">
                {/* Reference & Status */}
                <div className="flex justify-between items-center">
                  <span className="font-mono font-black text-xs text-slate-700 tracking-wider">
                    {batch.batch_reference}
                  </span>
                  <Badge className={`border text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${statusColors[batch.status]}`}>
                    {batch.status}
                  </Badge>
                </div>

                {/* Hospital details */}
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">Provider</p>
                  <p className="text-sm font-black text-slate-800 leading-tight mt-0.5 truncate" title={hospName}>
                    {hospName}
                  </p>
                </div>

                {/* Totals info */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Claims</p>
                    <p className="font-mono font-black text-slate-700 text-xs mt-0.5">
                      {batch.total_claims}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Month</p>
                    <p className="font-semibold text-slate-700 text-xs mt-0.5">
                      {batch.month}
                    </p>
                  </div>
                </div>

                {/* Amount info */}
                <div className="pt-2 border-t border-slate-50">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">Total Approved Amount</p>
                  <p className="font-mono font-black text-[#3f3f95] text-lg mt-0.5">
                    {money(batch.total_amount)}
                  </p>
                </div>
              </CardContent>

              {/* Actions Footer */}
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end shrink-0">
                <Button
                  onClick={() => setSelectedBatchId(batch.id)}
                  variant="outline"
                  className="bg-white border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider h-7 px-2.5 rounded-lg"
                >
                  Details
                </Button>

                 {!isViewOnly && (
                  <>
                    {batch.status === "draft" && canModifyDrafts && (
                      <>
                        <Button
                          onClick={() => handleCancelBatch(batch)}
                          variant="outline"
                          className="bg-white border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs uppercase tracking-wider h-7 px-2.5 rounded-lg"
                        >
                          Cancel Batch
                        </Button>
                        <Button
                          onClick={() => handleMarkReady(batch)}
                          className="bg-[#3f3f95] hover:bg-[#34347d] text-white font-black text-xs uppercase tracking-wider h-7 px-2.5 rounded-lg shadow-sm"
                        >
                          Mark Ready
                        </Button>
                      </>
                    )}

                    {batch.status === "ready" && (
                      <>
                        <Button
                          onClick={() => handleExportCSV(batch)}
                          variant="outline"
                          className="bg-white border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider h-7 px-2.5 rounded-lg gap-1"
                        >
                          <Download className="h-3 w-3" /> Export Sheet
                        </Button>
                        {canSettlePayments && (
                          <Button
                            onClick={() => setPayBatchTarget(batch)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider h-7 px-2.5 rounded-lg gap-1 shadow-sm"
                          >
                            <CheckCircle className="h-3 w-3" /> Mark Paid
                          </Button>
                        )}
                      </>
                    )}

                    {batch.status === "paid" && (
                      <Button
                        onClick={() => handleExportCSV(batch)}
                        variant="outline"
                        className="bg-white border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider h-7 px-2.5 rounded-lg gap-1"
                      >
                        <Download className="h-3 w-3" /> Export Sheet
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {filteredBatches.length === 0 && (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
          <FolderOpen className="h-10 w-10 text-slate-300" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            No Payment Batches found
          </p>
          <p className="text-xs font-bold text-slate-400 max-w-sm mt-0.5">
            Create drafts from Awaiting Payment to begin batch sheet reconciliation.
          </p>
        </div>
      )}

      {/* Batch Details Slide-out Drawer */}
      {selectedBatchId && (
        <BatchDetailsDrawer 
          isOpen={!!selectedBatchId}
          onOpenChange={(open) => !open && setSelectedBatchId(null)}
          batchId={selectedBatchId}
        />
      )}

      {/* Mark Batch as Paid Dialog */}
      {payBatchTarget && (
        <Dialog open={!!payBatchTarget} onOpenChange={(open) => {
          if (!open) {
            setPayBatchTarget(null);
            setReceiptFile(null);
            setBankRef("");
          }
        }}>
          <DialogContent className="sm:max-w-md rounded-2xl bg-white border border-slate-100 p-6 shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-600" /> Confirm Batch Settlement
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Confirming settlement marks all claims in batch <span className="font-bold font-mono text-slate-700">{payBatchTarget.batch_reference}</span> as paid. Ensure you have executed the bank transfer external to MedAuth.
              </p>

              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-400">Batch Ref:</span>
                  <span className="font-mono font-black text-slate-800">{payBatchTarget.batch_reference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-400">Hospital:</span>
                  <span className="font-black text-slate-800 truncate max-w-[200px]" title={payBatchTarget.hospitals?.name}>{payBatchTarget.hospitals?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-400">Total Payout:</span>
                  <span className="font-mono font-black text-emerald-600">{money(payBatchTarget.total_amount)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block">
                  Bank Reference Number / Transaction ID (Optional)
                </label>
                <input 
                  type="text"
                  placeholder="Enter NIBSS, Remita, or banking reference..."
                  value={bankRef}
                  onChange={(e) => setBankRef(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium w-full placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block">
                  Proof of Payment / Receipt Receipt (Optional)
                </label>
                <input 
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setReceiptFile(file);
                  }}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium w-full focus:outline-none focus:ring-1 focus:ring-[#3f3f95] cursor-pointer"
                />
              </div>
            </div>

            <DialogFooter className="flex sm:justify-between items-center gap-2 mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPayBatchTarget(null)}
                disabled={isSubmittingPayment}
                className="text-xs font-black uppercase tracking-wider text-slate-400 hover:text-slate-600 h-9 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmPayment}
                disabled={isSubmittingPayment}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs tracking-wider h-9 px-5 rounded-lg transition-all shadow-sm shadow-emerald-600/10"
              >
                {isSubmittingPayment ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Processing...
                  </span>
                ) : (
                  "Confirm Settlement"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
