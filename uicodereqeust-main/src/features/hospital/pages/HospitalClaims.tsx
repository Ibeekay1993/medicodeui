import { useState, useEffect } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { useHospitalProfile } from "../hooks/useHospitalDashboard";
import { useHospitalClaims } from "../hooks/useHospitalClaims";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import {
  ClaimDraft,
  calculateHospitalClaimStats,
  statusClass,
  statusLabel,
  contestedAmount,
  hasContestableDeductions
} from "@/lib/claims-helpers";

import HospitalClaimsHeader from "@/components/hospital-claims/HospitalClaimsHeader";
import HospitalClaimsStats from "@/components/hospital-claims/HospitalClaimsStats";
import HospitalClaimsTable from "@/components/hospital-claims/HospitalClaimsTable";
import HospitalClaimDetails from "@/components/hospital-claims/HospitalClaimDetails";
import ContestDecisionDialog, { ContestFormData } from "@/components/hospital-claims/ContestDecisionDialog";

export default function HospitalClaims() {
  const { user, hospitalId } = useAuth();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [contestTarget, setContestTarget] = useState<ClaimDraft | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const { data: hospital, isLoading: hospitalLoading } = useHospitalProfile(hospitalId || undefined, user?.id, user?.email);

  const { data: claimsData, isLoading: claimsLoading, refetch } = useHospitalClaims({
    hospital: hospital || null,
    debouncedSearch,
    page,
    pageSize,
  });

  const claims = claimsData?.claims || [];
  const total = claimsData?.total || 0;
  const loading = hospitalLoading || claimsLoading;
  
  const totalPages = Math.ceil(total / pageSize);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const claimStats = claimsData?.stats || (claimsData?.statsData ? calculateHospitalClaimStats(claimsData.statsData) : { pending: 0, approved: 0, paid: 0, totalValue: 0 });

  useTabVisibilityRefresh(() => { void refetch(); }, Boolean(hospital));

  const selectedClaim = claims.find(c => c.id === selectedClaimId) || null;
  const filteredClaims = statusFilter === "all" 
    ? claims 
    : claims.filter(c => {
        const s = String(c.status || "").toLowerCase();
        if (statusFilter === "submitted") return s === "submitted" || s === "pending" || s === "under_review";
        return s === statusFilter.toLowerCase();
      });
  const paginatedClaims = filteredClaims;

  const handleViewDetails = (id: string) => {
    setSelectedClaimId(id);
    setDetailsOpen(true);
  };

  const exportCSV = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const { data: hosp } = hospitalId
        ? await supabase.from("hospitals").select("id, name, code").eq("id", hospitalId).maybeSingle()
        : await supabase.from("hospitals").select("id, name, code").eq("user_id", user.id).maybeSingle();
      
      if (!hosp) {
        toast({ title: "No claims to export" });
        return;
      }

            const claimIdsFilter = [
        `hospital_id.eq.${hosp.id}`,
        `claiming_hospital_id.eq.${hosp.id}`,
      ];

      const { data: allClaimsData, error } = await (supabase
        .from("hospital_claims" as any)
        .select("created_at, claim_number, patient_name, policy_number, auth_code, total_amount, approved_amount, declined_amount, contest_note, status, notes, line_items, paid_at, contest_submitted_at")
        .or(claimIdsFilter.join(","))
        .order("created_at", { ascending: false }) as any);

      if (error) throw error;
      if (!allClaimsData || !allClaimsData.length) {
        toast({ title: "No claims to export" });
        return;
      }

      const sanitizeCsvCell = (val: any): string => {
        let str = String(val ?? "");
        if (/^[=\+\-@\t\r]/.test(str)) {
          str = "'" + str;
        }
        return `"${str.replace(/"/g, '""')}"`;
      };

      const headers = ["Date", "Claim ID", "Patient Name", "Policy Number", "Auth Code", "Total Amount", "Approved Amount", "Declined Amount", "Contest Note", "Contest Status", "Paid Date", "Status", "Notes", "Items Breakdown"];
      const rows = allClaimsData.map((r: any) => [
        new Date(r.created_at).toLocaleDateString("en-GB"),
        r.claim_number || "",
        r.patient_name || "",
        r.policy_number || "",
        r.auth_code || "",
        r.total_amount || 0,
        r.approved_amount || 0,
        r.declined_amount || 0,
        r.contest_note || "",
        ["contested", "under_contest"].includes(String(r.status).toLowerCase())
          ? "Contest submitted"
          : "Not contested",
        r.paid_at ? new Date(r.paid_at).toLocaleDateString("en-GB") : "",
        r.status || "",
        r.notes || "",
        Array.isArray(r.line_items) ? r.line_items.map((item: any) => `${item.name} (${item.quantity} x ₦${item.unit_price})`).join("; ") : ""
      ]);

      const csvContent = [headers.join(","), ...rows.map((e: any) => e.map(sanitizeCsvCell).join(","))].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Hospital_Claims_${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Export Successful" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export Failed", description: err.message || "Failed to export data." });
    } finally {
      setIsExporting(false);
    }
  };  const handleContestClaim = async (data: ContestFormData) => {
    if (!contestTarget) return;

    // ── Client-side pre-flight guards (mirror server-side RPC checks) ──
    if (!hasContestableDeductions(contestTarget)) {
      toast({
        variant: "destructive",
        title: "Contest Not Allowed",
        description: "Only partially approved, adjusted, rejected, or declined claims can be contested.",
      });
      return;
    }

    if (contestTarget.contest_deadline && new Date(contestTarget.contest_deadline) < new Date()) {
      toast({
        variant: "destructive",
        title: "Contest Window Closed",
        description: "The 7-day contest window for this claim has expired.",
      });
      return;
    }

    if (contestTarget.under_contest_amount && Number(contestTarget.under_contest_amount) > 0) {
      toast({
        variant: "destructive",
        title: "Already Contested",
        description: "This claim has already been submitted for contest review.",
      });
      return;
    }

    const amountUnderContest = contestedAmount(contestTarget);

    const documents = await Promise.all(
      (data.contestFiles || []).map(
        (file: File) =>
          new Promise<any>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({ name: file.name, size: file.size, type: file.type, data_url: reader.result, captured_at: new Date().toISOString() });
            reader.onerror = () =>
              resolve({ name: file.name, size: file.size, type: file.type, captured_at: new Date().toISOString() });
            reader.readAsDataURL(file);
          })
      )
    );

    // ── Secure server-side RPC — enforces ownership, status, deadline ──
    const { error } = await supabase.rpc("rpc_submit_claim_contest" as any, {
      p_claim_id:              contestTarget.id,
      p_reason:                data.contestReason,
      p_documents:             documents,
      p_under_contest_amount:  amountUnderContest,
    });

    if (error) {
      const msg = error.message || "";
      let description = "Failed to submit the contest appeal. Please try again.";
      if (msg.includes("UNAUTHORIZED") || msg.includes("FORBIDDEN")) {
        description = "You are not authorised to contest this claim.";
      } else if (msg.includes("DEADLINE_EXPIRED")) {
        description = "The 7-day contest window for this claim has closed.";
      } else if (msg.includes("DUPLICATE")) {
        description = "This claim has already been contested.";
      } else if (msg.includes("INVALID_STATE")) {
        description = "This claim cannot be contested in its current state.";
      } else if (msg.includes("NOT_FOUND")) {
        description = "Claim record not found. Please refresh and try again.";
      } else {
        description = msg;
      }
      toast({ variant: "destructive", title: "Contest Submission Failed", description });
    } else {
      toast({ title: "Contest Appeal Submitted", description: "The auditing panel has been notified for manual reconciliation." });
      await refetch();
      setContestTarget(null);
    }
  };

  const handleAcceptPayment = async (claim: ClaimDraft) => {
    try {
      const { error } = await supabase.rpc("release_claim_to_payment" as any, {
        p_claim_id: claim.id
      });
      if (error) throw error;
      toast({
        title: "Payout Accepted",
        description: "Claim has been moved directly to the payment queue for settlement.",
      });
      setDetailsOpen(false);
      await refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action Failed", description: err.message });
    }
  };

  const handleOpenContestChange = (open: boolean) => {
    if (!open) {
      setContestTarget(null);
    }
  };

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      <HospitalClaimsHeader
        search={search}
        setSearch={setSearch}
        exportCSV={exportCSV}
        isExporting={isExporting}
        loading={loading}
        hospitalName={hospital?.name}
        hospitalCode={hospital?.code}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />

      <HospitalClaimsStats
        pendingCount={claimStats.pending}
        approvedCount={claimStats.approved}
        paidCount={claimStats.paid}
        totalValue={claimStats.totalValue}
      />

      <HospitalClaimsTable
        loading={loading}
        filteredClaims={filteredClaims}
        paginatedClaims={paginatedClaims}
        onViewDetails={handleViewDetails}
        statusClass={statusClass}
        statusLabel={statusLabel}
        page={page}
        totalPages={totalPages}
        start={start}
        end={end}
        total={total}
        pageSize={pageSize}
        setPage={setPage}
      />

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider text-slate-900">
              Claim Details
            </DialogTitle>
          </DialogHeader>
          {selectedClaim && (
            <HospitalClaimDetails
              selectedClaim={selectedClaim}
              statusLabel={statusLabel}
              onContestClick={(claim) => {
                setDetailsOpen(false);
                setContestTarget(claim);
              }}
              onAcceptPayment={handleAcceptPayment}
            />
          )}
        </DialogContent>
      </Dialog>

      <ContestDecisionDialog
        contestTarget={contestTarget}
        isOpen={!!contestTarget}
        onOpenChange={handleOpenContestChange}
        onSubmit={handleContestClaim}
        contestedAmount={contestTarget ? contestedAmount(contestTarget) : 0}
      />
    </div>
  );
}
